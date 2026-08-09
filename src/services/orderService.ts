import { pool } from '../config/db';
import { sendOrderConfirmationEmail } from './emailService';

export interface ExtractedOrderData {
  customerName?: string;
  phone?: string;
  email?: string;
  fullAddress?: string;
  thanaUpazila?: string;
  district?: string;
}

export function parseOrderText(text: string): ExtractedOrderData | null {
  if (!text) return null;

  const data: ExtractedOrderData = {};
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match Name
    const nameMatch = trimmed.match(/^(?:নাম|Name)\s*[:|-]?\s*(.+)$/i);
    if (nameMatch && nameMatch[1] && !data.customerName) {
      const val = nameMatch[1].replace(/^[:|-]+\s*/, '').trim();
      if (val && !val.includes('অর্ডারটি নিশ্চিত করতে') && !val.includes('নিচের তথ্যগুলো')) {
        data.customerName = val;
      }
    }

    // Match Phone (Place longer patterns first)
    const phoneMatch = trimmed.match(/^(?:মোবাইল\s*নম্বর|মোবাইল|ফোন|Phone|Mobile)\s*[:|-]?\s*(.+)$/i);
    if (phoneMatch && phoneMatch[1] && !data.phone) {
      let val = phoneMatch[1].replace(/^[:|-]+\s*/, '').trim();
      data.phone = val;
    }

    // Match Email (Place longer patterns first)
    const emailMatch = trimmed.match(/^(?:ইমেইল\s*(?:\(যদি\s*থাকে\))?|ইমেইল|Email)\s*[:|-]?\s*(.+)$/i);
    if (emailMatch && emailMatch[1] && !data.email) {
      let val = emailMatch[1].replace(/^[:|-]+\s*/, '').trim();
      if (val.includes('@')) {
        data.email = val;
      }
    }

    // Match Address
    const addressMatch = trimmed.match(/^(?:সম্পূর্ণ\s*ঠিকানা|ঠিকানা|Address|Full\s*Address)\s*[:|-]?\s*(.+)$/i);
    if (addressMatch && addressMatch[1] && !data.fullAddress) {
      let val = addressMatch[1].replace(/^[:|-]+\s*/, '').trim();
      data.fullAddress = val;
    }

    // Match Thana/Upazila
    const thanaMatch = trimmed.match(/^(?:থানা\/উপজেলা|থানা|উপজেলা|Thana|Upazila)\s*[:|-]?\s*(.+)$/i);
    if (thanaMatch && thanaMatch[1] && !data.thanaUpazila) {
      let val = thanaMatch[1].replace(/^[:|-]+\s*/, '').trim();
      data.thanaUpazila = val;
    }

    // Match District
    const districtMatch = trimmed.match(/^(?:জেলা|District)\s*[:|-]?\s*(.+)$/i);
    if (districtMatch && districtMatch[1] && !data.district) {
      let val = districtMatch[1].replace(/^[:|-]+\s*/, '').trim();
      data.district = val;
    }
  }

  // General fallbacks if regex line matching missed phone or email
  if (!data.phone) {
    const rawPhoneMatch = text.match(/(?:01[3-9]\d{8}|\+?8801[3-9]\d{8})/);
    if (rawPhoneMatch) {
      data.phone = rawPhoneMatch[0];
    }
  }

  if (!data.email) {
    const rawEmailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (rawEmailMatch) {
      data.email = rawEmailMatch[0];
    }
  }

  // To be considered a valid order submission, we must have at least phone number AND (address OR customer name)
  if (data.phone && (data.fullAddress || data.customerName)) {
    return data;
  }

  return null;
}

export async function processOrderSubmission(
  messageText: string,
  senderId?: string
): Promise<{ isOrder: boolean; orderId?: number; responseText?: string }> {
  const orderData = parseOrderText(messageText);

  if (!orderData) {
    return { isOrder: false };
  }

  const customerName = orderData.customerName || 'সম্মানিত গ্রাহক';
  const phone = orderData.phone || 'N/A';
  const email = orderData.email || '';
  const fullAddress = orderData.fullAddress || 'N/A';
  const thanaUpazila = orderData.thanaUpazila || '';
  const district = orderData.district || '';

  try {
    const result = await pool.query(
      `INSERT INTO product_orders (sender_id, customer_name, phone, email, full_address, thana_upazila, district, raw_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [senderId || null, customerName, phone, email, fullAddress, thanaUpazila, district, messageText]
    );

    const newOrder = result.rows[0];
    const orderId = newOrder.id;

    console.log(`Successfully saved order #${orderId} for ${customerName} (${phone}) into product_orders table.`);

    // If customer provided an email address, send confirmation email via Nodemailer
    let emailStatusMessage = '';
    if (email && email.includes('@')) {
      const emailSent = await sendOrderConfirmationEmail({
        orderId,
        customerName,
        phone,
        email,
        fullAddress,
        thanaUpazila,
        district,
      });
      if (emailSent) {
        emailStatusMessage = `\n\nআপনার ইমেইল (${email})-এ একটি নিশ্চয়তা বার্তা (Order Confirmation Email) পাঠানো হয়েছে।`;
      }
    }

    const responseText = `অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে! 🎉\n\nঅর্ডার নং: #${orderId}\nনাম: ${customerName}\nমোবাইল নম্বর: ${phone}\nঠিকানা: ${fullAddress}${emailStatusMessage}\n\nআমাদের প্রতিনিধি ডেলিভারির জন্য দ্রুত আপনার সাথে যোগাযোগ করবেন। Sunnah Food BD-এর সাথে থাকার জন্য ধন্যবাদ!`;

    return {
      isOrder: true,
      orderId,
      responseText,
    };
  } catch (error) {
    console.error('Error saving order into product_orders table:', error);
    return {
      isOrder: false,
    };
  }
}
