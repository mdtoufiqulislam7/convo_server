import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool, hashPassword } from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'convoai_secret_jwt_token_2026';

// Extend Express Request object to hold user details
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
}

// JWT verification middleware
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <TOKEN>

  if (!token) {
    res.status(401).json({ success: false, message: 'Authentication token required.' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      res.status(403).json({ success: false, message: 'Invalid or expired session token.' });
      return;
    }
    req.user = decoded as any;
    next();
  });
}

// Admin role check middleware
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Administrator privileges required.' });
    return;
  }
  next();
}

// Register Client (POST /api/auth/register)
export async function register(req: Request, res: Response): Promise<void> {
  const { name, phone, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    return;
  }

  try {
    // Check if email already exists
    const emailCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      res.status(400).json({ success: false, message: 'Email address is already registered.' });
      return;
    }

    const passwordHash = hashPassword(password);
    
    // Default role = 'client'
    const result = await pool.query(
      `INSERT INTO users (name, phone, email, role, password_hash) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, name, email, role`,
      [name, phone || '', email, 'client', passwordHash]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      token,
      user
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Server registration error. Please try again.' });
  }
}

// Login (POST /api/auth/login)
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Email and password are required.' });
    return;
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid email credentials.' });
      return;
    }

    const passwordHash = hashPassword(password);
    if (user.password_hash !== passwordHash) {
      res.status(401).json({ success: false, message: 'Invalid password credentials.' });
      return;
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      success: true,
      message: 'Logged in successfully.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server login error. Please try again.' });
  }
}
