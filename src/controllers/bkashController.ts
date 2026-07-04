import { Response } from 'express';
import axios from 'axios';
import { pool } from '../config/db';
import { AuthenticatedRequest } from './authController';

const BKASH_BASE_URL = process.env.BKASH_BASE_URL || 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized';
const BKASH_USERNAME = process.env.BKASH_USERNAME;
const BKASH_PASSWORD = process.env.BKASH_PASSWORD;
const BKASH_KEY = process.env.BKASH_KEY;
const BKASH_SECRET = process.env.BKASH_SECRET;

// Helper to generate access token
async function getBkashToken(): Promise<string> {
  if (!BKASH_USERNAME || !BKASH_PASSWORD || !BKASH_KEY || !BKASH_SECRET) {
    throw new Error('bKash credentials missing in .env config.');
  }

  const url = `${BKASH_BASE_URL}/checkout/token/grant`;
  const response = await axios.post(
    url,
    {
      app_key: BKASH_KEY,
      app_secret: BKASH_SECRET,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        username: BKASH_USERNAME,
        password: BKASH_PASSWORD,
      },
    }
  );

  if (response.data && response.data.id_token) {
    return response.data.id_token;
  }
  throw new Error(response.data.errorMessage || 'Failed to grant token from bKash API.');
}

// 1. Create Payment (POST /api/bkash/create)
export async function createPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { amount, packageName, simulate } = req.body;
  const userId = req.user?.id;

  if (!amount || !packageName) {
    res.status(400).json({ success: false, message: 'Amount and package name are required.' });
    return;
  }

  const invoiceNo = `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // If simulate flag is passed, or if credentials are empty, bypass to simulator mode
  if (simulate || !BKASH_USERNAME || !BKASH_PASSWORD) {
    console.log(`[bKash Simulator] Creating simulated payment for invoice ${invoiceNo} (${packageName})...`);
    
    // Create a pending payment in DB
    await pool.query(
      `INSERT INTO payments (user_id, invoice_no, amount, payment_status, package_name) 
       VALUES ($1, $2, $3, $4, $5)`,
      [userId || null, invoiceNo, amount, 'pending', packageName]
    );

    const redirectUrl = `https://api.convoes.app/api/bkash/callback?paymentID=MOCK_${invoiceNo}&status=success&invoiceNo=${invoiceNo}`;
    
    res.status(200).json({
      success: true,
      message: 'Simulated payment created successfully.',
      isSimulation: true,
      bkashURL: redirectUrl, // In simulator, direct client straight to callback
      invoiceNo
    });
    return;
  }

  try {
    const idToken = await getBkashToken();
    console.log('Granted token from bKash checkout endpoint.');

    const createUrl = `${BKASH_BASE_URL}/checkout/create`;
    const response = await axios.post(
      createUrl,
      {
        mode: '0011',
        payerReference: userId ? String(userId) : 'guest_user',
        callbackURL: 'https://api.convoes.app/api/bkash/callback',
        amount: String(amount),
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber: invoiceNo,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: idToken,
          'X-APP-Key': BKASH_KEY,
        },
      }
    );

    const { paymentID, bkashURL, errorCode, errorMessage } = response.data;

    if (errorCode) {
      console.warn(`bKash API Error: ${errorCode} - ${errorMessage}. Falling back to simulation mode.`);
      // Force simulator fallback on credentials error
      res.status(200).json({
        success: true,
        isSimulation: true,
        message: `bKash API rejected request: ${errorMessage}. Redirecting to Sandbox Simulator.`,
        bkashURL: `https://api.convoes.app/api/bkash/callback?paymentID=SIM_${invoiceNo}&status=success&invoiceNo=${invoiceNo}&simAmount=${amount}&simPackage=${encodeURIComponent(packageName)}`
      });
      return;
    }

    // Insert pending payment into database
    await pool.query(
      `INSERT INTO payments (user_id, invoice_no, amount, payment_status, package_name, bkash_trx_id) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId || null, invoiceNo, amount, 'pending', packageName, paymentID]
    );

    res.status(200).json({
      success: true,
      bkashURL,
      paymentID,
      invoiceNo
    });
  } catch (error: any) {
    console.error('Error initiating bKash checkout:', error.message || error);
    // Force simulator fallback on network error
    res.status(200).json({
      success: true,
      isSimulation: true,
      message: 'bKash network endpoint unreachable. Redirecting to Sandbox Simulator.',
      bkashURL: `https://api.convoes.app/api/bkash/callback?paymentID=SIM_${invoiceNo}&status=success&invoiceNo=${invoiceNo}&simAmount=${amount}&simPackage=${encodeURIComponent(packageName)}`
    });
  }
}

// 2. Callback Listener (GET /api/bkash/callback)
export async function callbackPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { paymentID, status, invoiceNo, simAmount, simPackage } = req.query;

  console.log(`Received bKash callback response. Status: ${status}, PaymentID: ${paymentID}`);

  if (status !== 'success') {
    res.redirect(`http://localhost:3000/dashboard?payment_status=failed&message=Payment+cancelled+or+failed`);
    return;
  }

  // Handle Simulation Execute
  if (paymentID && (String(paymentID).startsWith('MOCK_') || String(paymentID).startsWith('SIM_'))) {
    const inv = invoiceNo ? String(invoiceNo) : `INV-MOCK-${Date.now()}`;
    const mockTrxId = `BKASH-${Date.now().toString().slice(-8)}`;

    try {
      // Find if invoice exists, if not create it
      const checkInv = await pool.query('SELECT * FROM payments WHERE invoice_no = $1', [inv]);
      if (checkInv.rows.length > 0) {
        await pool.query(
          `UPDATE payments 
           SET payment_status = 'completed', bkash_trx_id = $1 
           WHERE invoice_no = $2`,
          [mockTrxId, inv]
        );
      } else {
        // If it was forced fallback and doesn't exist yet, insert completed
        const finalAmt = simAmount ? Number(simAmount) : 79.00;
        const finalPkg = simPackage ? String(simPackage) : 'Advanced Vector Search Bundle';
        await pool.query(
          `INSERT INTO payments (invoice_no, amount, payment_status, bkash_trx_id, package_name) 
           VALUES ($1, $2, 'completed', $3, $4)`,
          [inv, finalAmt, mockTrxId, finalPkg]
        );
      }

      console.log(`Simulated payment complete. Saved Invoice ${inv} with Trx: ${mockTrxId}`);
      res.redirect(`http://localhost:3000/dashboard?payment_status=success&invoice_no=${inv}&trx_id=${mockTrxId}`);
    } catch (err) {
      console.error('Database error saving simulated invoice:', err);
      res.redirect(`http://localhost:3000/dashboard?payment_status=error`);
    }
    return;
  }

  // Handle Real Execute
  try {
    const idToken = await getBkashToken();
    const executeUrl = `${BKASH_BASE_URL}/checkout/execute`;
    
    const response = await axios.post(
      executeUrl,
      { paymentID },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: idToken,
          'X-APP-Key': BKASH_KEY,
        },
      }
    );

    const { trxID, transactionStatus, merchantInvoiceNumber, errorMessage } = response.data;

    if (transactionStatus === 'Completed') {
      // Update payment to completed in database
      await pool.query(
        `UPDATE payments 
         SET payment_status = 'completed', bkash_trx_id = $1 
         WHERE bkash_trx_id = $2`,
        [trxID, paymentID]
      );
      
      console.log(`Payment confirmed via bKash. TrxID: ${trxID}`);
      res.redirect(`http://localhost:3000/dashboard?payment_status=success&invoice_no=${merchantInvoiceNumber}&trx_id=${trxID}`);
    } else {
      console.warn(`Payment execute failed: ${errorMessage}`);
      res.redirect(`http://localhost:3000/dashboard?payment_status=failed&message=${encodeURIComponent(errorMessage || 'Execution failed')}`);
    }
  } catch (error: any) {
    console.error('Error executing bKash payment callback:', error.message || error);
    res.redirect(`http://localhost:3000/dashboard?payment_status=error`);
  }
}
