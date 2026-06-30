import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

export const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '25060', 10),
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
});

export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    console.log('Initializing database tables...');
    
    // Create chat_messages table
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

    // Create lead_tracker table
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

  } catch (error) {
    console.error('Error during database table initialization:', error);
    throw error;
  } finally {
    client.release();
  }
}
