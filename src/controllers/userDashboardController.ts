import { Response } from 'express';
import { pool } from '../config/db';
import { AuthenticatedRequest } from './authController';

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
    res.status(200).json({ success: true, products: result.rows });
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

  const { pageName, pageId, pageAccessToken, verifyToken } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO page_credentials (user_id, page_name, page_id, page_access_token, verify_token) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         page_name = EXCLUDED.page_name, 
         page_id = EXCLUDED.page_id, 
         page_access_token = EXCLUDED.page_access_token, 
         verify_token = EXCLUDED.verify_token 
       RETURNING *`,
      [userId, pageName || '', pageId || '', pageAccessToken || '', verifyToken || '']
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
