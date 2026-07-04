import { Pool } from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

export const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '25060', 10),
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
});

// Helper function to hash password with SHA-256
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    console.log('Initializing database tables...');
    
    // 1. Create chat_messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        sender_id VARCHAR(255) NOT NULL,
        message_text TEXT NOT NULL,
        response_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "chat_messages" checked/created.');

    // 2. Create lead_tracker table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_tracker (
        id SERIAL PRIMARY KEY,
        business_name VARCHAR(255) NOT NULL,
        page_url VARCHAR(255) NOT NULL,
        custom_product_catalog TEXT,
        contact_email VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "lead_tracker" checked/created.');

    // 3. Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        email VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(50) DEFAULT 'client',
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "users" checked/created.');

    // 4. Create subscription_plans table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        features TEXT[] NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "subscription_plans" checked/created.');

    // 5. Create payments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        invoice_no VARCHAR(255) UNIQUE NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        payment_status VARCHAR(50) DEFAULT 'pending',
        bkash_trx_id VARCHAR(255),
        package_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "payments" checked/created.');

    // 6. Alter payments table to append subscription_id foreign key safely
    await client.query(`
      ALTER TABLE payments 
      ADD COLUMN IF NOT EXISTS subscription_id INTEGER REFERENCES subscription_plans(id) ON DELETE SET NULL;
    `);
    console.log('payments table altered to verify subscription_id column.');

    // 7. Create user_products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_products (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "user_products" checked/created.');

    // 8. Create page_credentials table
    await client.query(`
      CREATE TABLE IF NOT EXISTS page_credentials (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        page_name VARCHAR(255),
        page_id VARCHAR(255),
        page_access_token TEXT,
        verify_token VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "page_credentials" checked/created.');

    // Seed default subscription plans if empty
    const planCheck = await client.query('SELECT COUNT(*) FROM subscription_plans');
    if (parseInt(planCheck.rows[0].count, 10) === 0) {
      console.log('Seeding default subscription plans...');
      await client.query(`
        INSERT INTO subscription_plans (name, price, features, description) VALUES
        ($1, $2, $3, $4),
        ($5, $6, $7, $8),
        ($9, $10, $11, $12)
      `, [
        'Basic Automation Setup', 2900.00, ['Up to 50 Products catalog', 'Keyword smart matching', 'Gemini Auto-replies'], 'Standard response setup for small business FB pages.',
        'Advanced Vector Search Bundle', 7900.00, ['Up to 500 Products catalog', 'Keyword + Description search', 'Advanced context parsing'], 'Advanced vector search indexing for dynamic product inventories.',
        'Custom Automation Suite', 19900.00, ['Unlimited Products catalog', 'Dedicated database indexer', '24/7 dedicated developer Support'], 'Custom API integrations and dedicated support resources.'
      ]);
      console.log('Subscription plans seeded successfully.');
    }

    // Seed default admin if it does not exist
    const adminEmail = 'admin@convoes.app';
    const adminCheck = await client.query('SELECT * FROM users WHERE email = $1', [adminEmail]);
    if (adminCheck.rows.length === 0) {
      console.log('Seeding default administrator account...');
      const adminPasswordHash = hashPassword('admin123');
      await client.query(`
        INSERT INTO users (name, phone, email, role, password_hash)
        VALUES ($1, $2, $3, $4, $5)
      `, ['System Administrator', '01794952497', adminEmail, 'admin', adminPasswordHash]);
      console.log('Seeding completed. Credentials: admin@convoes.app / admin123');
    }

  } catch (error) {
    console.error('Error during database table initialization:', error);
    throw error;
  } finally {
    client.release();
  }
}
