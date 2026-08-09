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

    // 7. Create products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        description TEXT,
        stock_status VARCHAR(50) DEFAULT 'in_stock',
        keywords TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "products" checked/created.');

    // 8. Create user_products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_products (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "user_products" checked/created.');

    // 9. Create product_orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_orders (
        id SERIAL PRIMARY KEY,
        sender_id VARCHAR(255),
        customer_name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(255),
        full_address TEXT NOT NULL,
        thana_upazila VARCHAR(255),
        district VARCHAR(255),
        order_status VARCHAR(50) DEFAULT 'pending',
        raw_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "product_orders" checked/created.');

    // 8. Create page_credentials table
    await client.query(`
      CREATE TABLE IF NOT EXISTS page_credentials (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        page_name VARCHAR(255),
        page_id VARCHAR(255),
        page_access_token TEXT,
        verify_token VARCHAR(255),
        voice_enabled BOOLEAN DEFAULT FALSE,
        voice_provider VARCHAR(50) DEFAULT 'google',
        voice_api_key TEXT,
        voice_language VARCHAR(50) DEFAULT 'bn',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "page_credentials" checked/created.');

    // 9. Alter page_credentials table to append voice columns safely if table already exists
    await client.query(`
      ALTER TABLE page_credentials 
      ADD COLUMN IF NOT EXISTS voice_enabled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS voice_provider VARCHAR(50) DEFAULT 'google',
      ADD COLUMN IF NOT EXISTS voice_api_key TEXT,
      ADD COLUMN IF NOT EXISTS voice_language VARCHAR(50) DEFAULT 'bn';
    `);
    console.log('page_credentials table altered to verify voice settings columns.');

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

    // Seed default products catalog if empty
    const productCheck = await client.query('SELECT COUNT(*) FROM products');
    if (parseInt(productCheck.rows[0].count, 10) === 0) {
      console.log('Seeding default products catalog...');
      const productsData = [
        ['মারিঙ্গা পাউডার (Moringa Powder)', 700.00, 'মারিঙ্গা পাউডার। এটি একটি সুপার ফুড মানুষের জন্য, যা মানুষের শরীলে হারানো পুষ্টি ফিরিয়ে আনে। মূল্য: ৭০০ টাকা প্রতি কেজি।', 'in_stock', ['মারিঙ্গা পাউডার', 'মোরিঙ্গা পাউডার', 'মারিঙ্গা', 'মোরিঙ্গা', 'সুপার ফুড', 'moringa', 'moringa powder', 'powder', 'পাউডার']],
        ['মরিয়ম খেজুর (Maryam Dates)', 1250.00, 'মিশর থেকে সুপার কোয়ালিটির মরিয়ম খেজুর পেয়ে যাবেন আমাদের সুন্নাহ ফুড বিডি তে। মূল্য: ১২৫০ টাকা প্রতি কেজি।', 'in_stock', ['মরিয়ম খেজুর', 'মরিয়ম খেজুর', 'মরিয়ম', 'মরিয়ম', 'মিশরীয় খেজুর', 'মিশর', 'maryam dates', 'mariyom dates', 'dates', 'খেজুরে', 'খেজুর']],
        ['কালো কিসমিস (Black Raisins)', 1050.00, 'পাকিস্তান এর বাগান থেকে নিয়ে এসেছি বিখ্যাত কালো কিসমিস। মূল্য: ১০৫০ টাকা প্রতি কেজি।', 'in_stock', ['কালো কিসমিস', 'কিসমিস', 'কিশমিশ', 'কালো কিশমিশ', 'পাকিস্তান কিসমিস', 'kalo kismis', 'kismis', 'raisins', 'black raisins']],
        ['কাঠের ঘানির সরিষার তেল (Mustard Oil)', 320.00, 'দেশি সরিষার কাঠের ঘানি তে ভাঙা প্রথম চাপের সরিষার তেল। মূল্য: ৩২০ টাকা প্রতি লিটার।', 'in_stock', ['সরিষার তেল', 'ঘানির তেল', 'কাঠের ঘানি', 'সরিষা তেল', 'সরিষা', 'প্রথম চাপ', 'sorishar tel', 'mustard oil', 'oil', 'তেল']],
        ['গাওয়া ঘি (Pure Ghee)', 1600.00, 'সুন্নাহ ফুড এর গাওয়া ঘি। দেশি গরুর খাঁটি দুধ দিয়ে মিষ্টি কড়া জালের ঘি। পুষ্টিগত মান ঠিক রেখে আমরাই দিচ্ছি খাঁটি গাওয়া ঘি। মূল্য: ১৬০০ টাকা প্রতি কেজি।', 'in_stock', ['গাওয়া ঘি', 'গাওয়া ঘি', 'ঘি', 'খাঁটি ঘি', 'গাওয়া', 'ghee', 'gawa ghee', 'pure ghee']],
        ['মেডজুল খেজুর (Medjool Dates)', 2200.00, 'সৌদি আরব এর বাগান থেকে বাছাই কৃত সেরা মেডজুল খেজুর। নিজস্ব তত্বাবধানে যত্নের সাথে মোড়কজাত করে পৌঁছে দিচ্ছি আপনার ঘরে। মূল্য: ২২০০ টাকা প্রতি কেজি।', 'in_stock', ['মেডজুল খেজুর', 'মেডজুল', 'সৌদি খেজুর', 'সৌদি আরব', 'medjool dates', 'medjool', 'dates', 'খেজুর']]
      ];

      for (const p of productsData) {
        await client.query(`
          INSERT INTO products (name, price, description, stock_status, keywords)
          VALUES ($1, $2, $3, $4, $5)
        `, p);
      }
      console.log('Default products catalog seeded successfully.');
    }

  } catch (error) {
    console.error('Error during database table initialization:', error);
    throw error;
  } finally {
    client.release();
  }
}
