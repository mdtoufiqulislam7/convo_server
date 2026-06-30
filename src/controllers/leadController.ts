import { Request, Response } from 'express';
import { pool } from '../config/db';

export async function createLead(req: Request, res: Response): Promise<void> {
  const { businessName, pageUrl, customProductCatalog, contactEmail } = req.body;

  // Simple validation
  if (!businessName || !pageUrl || !contactEmail) {
    res.status(400).json({ 
      success: false, 
      message: 'Business Name, Page URL, and Contact Email are required fields.' 
    });
    return;
  }

  try {
    console.log(`Recording new lead for business: ${businessName} (${contactEmail})`);
    
    const result = await pool.query(
      `INSERT INTO lead_tracker (business_name, page_url, custom_product_catalog, contact_email) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, created_at`,
      [businessName, pageUrl, customProductCatalog || '', contactEmail]
    );

    res.status(201).json({
      success: true,
      message: 'Lead recorded successfully.',
      leadId: result.rows[0].id,
      createdAt: result.rows[0].created_at
    });
  } catch (error: any) {
    console.error('Error saving lead to database:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to record lead in database. Please try again later.' 
    });
  }
}

export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const messagesCountRes = await pool.query('SELECT COUNT(*) FROM chat_messages');
    const leadsCountRes = await pool.query('SELECT COUNT(*) FROM lead_tracker');
    const productsCountRes = await pool.query('SELECT COUNT(*) FROM products');

    res.status(200).json({
      success: true,
      messagesCount: parseInt(messagesCountRes.rows[0].count || '0', 10),
      leadsCount: parseInt(leadsCountRes.rows[0].count || '0', 10),
      productsCount: parseInt(productsCountRes.rows[0].count || '0', 10)
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics statistics.'
    });
  }
}
