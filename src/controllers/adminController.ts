import { Response } from 'express';
import { pool } from '../config/db';
import { AuthenticatedRequest } from './authController';

// 1. Get Webhook chat message log list (GET /api/admin/messages)
export async function getMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query('SELECT * FROM chat_messages ORDER BY created_at DESC');
    res.status(200).json({ success: true, messages: result.rows });
  } catch (error) {
    console.error('Admin getMessages error:', error);
    res.status(500).json({ success: false, message: 'Server database query error.' });
  }
}

// 2. Get Users list (GET /api/admin/users)
export async function getUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query('SELECT id, name, phone, email, role, created_at FROM users ORDER BY created_at DESC');
    res.status(200).json({ success: true, users: result.rows });
  } catch (error) {
    console.error('Admin getUsers error:', error);
    res.status(500).json({ success: false, message: 'Server database query error.' });
  }
}

// 3. Update User Role (POST /api/admin/users/:id/role)
export async function updateUserRole(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { role } = req.body;

  if (!role || (role !== 'admin' && role !== 'client')) {
    res.status(400).json({ success: false, message: 'Invalid role assignment.' });
    return;
  }

  try {
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    res.status(200).json({ success: true, message: `User role updated to ${role} successfully.` });
  } catch (error) {
    console.error('Admin updateUserRole error:', error);
    res.status(500).json({ success: false, message: 'Server database write error.' });
  }
}

// 4. Get Payments/Invoices list (GET /api/admin/payments)
export async function getPayments(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(`
      SELECT p.*, u.name as user_name, u.email as user_email 
      FROM payments p 
      LEFT JOIN users u ON p.user_id = u.id 
      ORDER BY p.created_at DESC
    `);
    res.status(200).json({ success: true, payments: result.rows });
  } catch (error) {
    console.error('Admin getPayments error:', error);
    res.status(500).json({ success: false, message: 'Server database query error.' });
  }
}

// 5. Get Leads list (GET /api/admin/leads)
export async function getLeads(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query('SELECT * FROM lead_tracker ORDER BY created_at DESC');
    res.status(200).json({ success: true, leads: result.rows });
  } catch (error) {
    console.error('Admin getLeads error:', error);
    res.status(500).json({ success: false, message: 'Server database query error.' });
  }
}

// 6. Get Products list (GET /api/admin/products)
export async function getProducts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
    res.status(200).json({ success: true, products: result.rows });
  } catch (error) {
    console.error('Admin getProducts error:', error);
    res.status(500).json({ success: false, message: 'Server database query error.' });
  }
}

// 7. Add Product (POST /api/admin/products)
export async function createProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { name, price, description, stockStatus, keywords } = req.body;

  if (!name || !price || !description) {
    res.status(400).json({ success: false, message: 'Product name, price, and description are required.' });
    return;
  }

  // Parse keywords: convert comma separated string into array, or use array directly
  let keywordsArray: string[] = [];
  if (Array.isArray(keywords)) {
    keywordsArray = keywords.map(k => String(k).trim().toLowerCase());
  } else if (typeof keywords === 'string') {
    keywordsArray = keywords.split(',').map(k => k.trim().toLowerCase());
  }

  try {
    const result = await pool.query(
      `INSERT INTO products (name, price, description, stock_status, keywords) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [name, price, description, stockStatus || 'in_stock', keywordsArray]
    );

    res.status(201).json({
      success: true,
      message: 'Product catalog item added successfully.',
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Admin createProduct error:', error);
    res.status(500).json({ success: false, message: 'Server database write error.' });
  }
}
