import { Request, Response } from 'express';
import { pool } from '../config/db';
import { AuthenticatedRequest } from './authController';

// Helper to calculate inquiry stats/popularity for a list of products
async function getProductPopularity(products: any[]): Promise<any[]> {
  try {
    const msgsRes = await pool.query('SELECT message_text, response_text FROM chat_messages');
    const messages = msgsRes.rows;

    if (messages.length === 0 || products.length === 0) {
      return products.map(p => ({ ...p, popularity_percentage: 0, inquiry_count: 0 }));
    }

    let totalMatches = 0;
    const matchCounts = products.map(p => {
      let count = 0;
      const keywords = p.keywords || [];
      for (const msg of messages) {
        const text = ((msg.message_text || '') + ' ' + (msg.response_text || '')).toLowerCase();
        const matches = keywords.some((kw: string) => text.includes(kw.toLowerCase()));
        if (matches) {
          count++;
        }
      }
      totalMatches += count;
      return { id: p.id, count };
    });

    return products.map(p => {
      const match = matchCounts.find(m => m.id === p.id);
      const count = match ? match.count : 0;
      const pct = totalMatches > 0 ? Math.round((count / totalMatches) * 100) : 0;
      return {
        ...p,
        inquiry_count: count,
        popularity_percentage: pct
      };
    });
  } catch (err) {
    console.error('Error calculating product popularity:', err);
    return products.map(p => ({ ...p, popularity_percentage: 0, inquiry_count: 0 }));
  }
}

// 1. Get products associated with the user (GET /api/user/products)
export async function getUserProducts(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: 'Unauthorized user context.' });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT p.* 
       FROM products p 
       JOIN user_products up ON p.id = up.product_id 
       WHERE up.user_id = $1 
       ORDER BY p.id DESC`,
      [userId]
    );
    const productsWithStats = await getProductPopularity(result.rows);
    res.status(200).json({ success: true, products: productsWithStats });
  } catch (error) {
    console.error('Error fetching user products:', error);
    res.status(500).json({ success: false, message: 'Server database query error.' });
  }
}

// 2. Create a product and link to user_products (POST /api/user/products)
export async function createUserProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: 'Unauthorized user context.' });
    return;
  }

  const { name, price, description, stockStatus, keywords } = req.body;

  if (!name || !price || !description) {
    res.status(400).json({ success: false, message: 'Product name, price, and description are required.' });
    return;
  }

  let keywordsArray: string[] = [];
  if (Array.isArray(keywords)) {
    keywordsArray = keywords.map(k => String(k).trim().toLowerCase());
  } else if (typeof keywords === 'string') {
    keywordsArray = keywords.split(',').map(k => k.trim().toLowerCase());
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Insert into products
    const prodResult = await client.query(
      `INSERT INTO products (name, price, description, stock_status, keywords) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [name, price, description, stockStatus || 'in_stock', keywordsArray]
    );
    
    const newProduct = prodResult.rows[0];

    // Link in user_products
    await client.query(
      `INSERT INTO user_products (user_id, product_id) 
       VALUES ($1, $2)`,
      [userId, newProduct.id]
    );

    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: 'Product catalog item created and mapped successfully.',
      product: newProduct
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating user product:', error);
    res.status(500).json({ success: false, message: 'Server database transaction error.' });
  } finally {
    client.release();
  }
}

// 3. Get user page credentials (GET /api/user/credentials)
export async function getUserCredentials(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: 'Unauthorized user context.' });
    return;
  }

  try {
    const result = await pool.query('SELECT * FROM page_credentials WHERE user_id = $1', [userId]);
    res.status(200).json({ success: true, credentials: result.rows[0] || null });
  } catch (error) {
    console.error('Error fetching user page credentials:', error);
    res.status(500).json({ success: false, message: 'Server database query error.' });
  }
}

// 4. Save/update user page credentials (POST /api/user/credentials)
export async function upsertUserCredentials(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: 'Unauthorized user context.' });
    return;
  }

  const { 
    pageName, 
    pageId, 
    pageAccessToken, 
    verifyToken,
    voiceEnabled,
    voiceProvider,
    voiceApiKey,
    voiceLanguage
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO page_credentials (
         user_id, page_name, page_id, page_access_token, verify_token, 
         voice_enabled, voice_provider, voice_api_key, voice_language
       ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         page_name = EXCLUDED.page_name, 
         page_id = EXCLUDED.page_id, 
         page_access_token = EXCLUDED.page_access_token, 
         verify_token = EXCLUDED.verify_token,
         voice_enabled = EXCLUDED.voice_enabled,
         voice_provider = EXCLUDED.voice_provider,
         voice_api_key = EXCLUDED.voice_api_key,
         voice_language = EXCLUDED.voice_language
       RETURNING *`,
      [
        userId, 
        pageName || '', 
        pageId || '', 
        pageAccessToken || '', 
        verifyToken || '',
        voiceEnabled === true || voiceEnabled === 'true',
        voiceProvider || 'google',
        voiceApiKey || '',
        voiceLanguage || 'bn'
      ]
    );

    res.status(200).json({
      success: true,
      message: 'Facebook Page credentials saved successfully.',
      credentials: result.rows[0]
    });
  } catch (error) {
    console.error('Error saving user page credentials:', error);
    res.status(500).json({ success: false, message: 'Server database write error.' });
  }
}

// 5. Get subscription plans (GET /api/subscription-plans)
export async function getSubscriptionPlans(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query('SELECT * FROM subscription_plans ORDER BY id ASC');
    res.status(200).json({ success: true, plans: result.rows });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ success: false, message: 'Server database query error.' });
  }
}
