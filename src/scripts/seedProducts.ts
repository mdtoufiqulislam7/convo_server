import { pool } from '../config/db';

export const productsData = [
  {
    name: 'মারিঙ্গা পাউডার (Moringa Powder)',
    price: 700.00,
    description: 'মারিঙ্গা পাউডার। এটি একটি সুপার ফুড মানুষের জন্য, যা মানুষের শরীলে হারানো পুষ্টি ফিরিয়ে আনে। মূল্য: ৭০০ টাকা প্রতি কেজি।',
    stock_status: 'in_stock',
    keywords: ['মারিঙ্গা পাউডার', 'মোরিঙ্গা পাউডার', 'মারিঙ্গা', 'মোরিঙ্গা', 'সুপার ফুড', 'moringa', 'moringa powder', 'maringa', 'maringa powder', 'powder', 'পাউডার']
  },
  {
    name: 'Premium Ajwa Dates (প্রিমিয়াম আজওয়া খেজুর)',
    price: 1200.00,
    description: '১০০% প্রিমিয়াম কোয়ালিটির মদিনার আজওয়া খেজুর। অত্যন্ত সুস্বাদু ও পুষ্টিগুণে ভরপুর। অর্গানিক উপায়ে সংগৃহীত ও প্রক্রিয়াজাতকৃত। ক্যাশ অন ডেলিভারি সুবিধা রয়েছে।',
    stock_status: 'in_stock',
    keywords: ['ajwa dates', 'ajwa khejur', 'ajwa', 'আজওয়া', 'আজওয়া খেজুর', 'আজওয়া', 'আজওয়া খেজুর', 'মদিনার আজওয়া']
  },
  {
    name: 'মরিয়ম খেজুর (Maryam Dates)',
    price: 1250.00,
    description: 'মিশর থেকে সুপার কোয়ালিটির মরিয়ম খেজুর পেয়ে যাবেন আমাদের সুন্নাহ ফুড বিডি তে। মূল্য: ১২৫০ টাকা প্রতি কেজি।',
    stock_status: 'in_stock',
    keywords: ['মরিয়ম খেজুর', 'মরিয়ম খেজুর', 'মরিয়ম', 'মরিয়ম', 'মিশরীয় খেজুর', 'মিশর', 'maryam dates', 'mariyom dates', 'moriom', 'moriom khejur', 'moriom dates', 'marium', 'marium khejur', 'maryam', 'maryam khejur']
  },
  {
    name: 'কালো কিসমিস (Black Raisins)',
    price: 1050.00,
    description: 'পাকিস্তান এর বাগান থেকে নিয়ে এসেছি বিখ্যাত কালো কিসমিস। মূল্য: ১০৫০ টাকা প্রতি কেজি।',
    stock_status: 'in_stock',
    keywords: ['কালো কিসমিস', 'কিসমিস', 'কিশমিশ', 'কালো কিশমিশ', 'পাকিস্তান কিসমিস', 'kalo kismis', 'kismis', 'kishmish', 'raisins', 'black raisins']
  },
  {
    name: 'কাঠের ঘানির সরিষার তেল (Mustard Oil)',
    price: 320.00,
    description: 'দেশি সরিষার কাঠের ঘানি তে ভাঙা প্রথম চাপের সরিষার তেল। মূল্য: ৩২০ টাকা প্রতি লিটার।',
    stock_status: 'in_stock',
    keywords: ['সরিষার তেল', 'ঘানির তেল', 'কাঠের ঘানি', 'সরিষা তেল', 'সরিষা', 'প্রথম চাপ', 'sorishar tel', 'sorisha tel', 'mustard oil', 'oil', 'তেল']
  },
  {
    name: 'গাওয়া ঘি (Pure Ghee)',
    price: 1600.00,
    description: 'সুন্নাহ ফুড এর গাওয়া ঘি। দেশি গরুর খাঁটি দুধ দিয়ে মিষ্টি কড়া জালের ঘি। পুষ্টিগত মান ঠিক রেখে আমরাই দিচ্ছি খাঁটি গাওয়া ঘি। মূল্য: ১৬০০ টাকা প্রতি কেজি।',
    stock_status: 'in_stock',
    keywords: ['গাওয়া ঘি', 'গাওয়া ঘি', 'ঘি', 'খাঁটি ঘি', 'গাওয়া', 'ghee', 'gawa ghee', 'pure ghee', 'ghie', 'ghi']
  },
  {
    name: 'মেডজুল খেজুর (Medjool Dates)',
    price: 2200.00,
    description: 'সৌদি আরব এর বাগান থেকে বাছাই কৃত সেরা মেডজুল খেজুর। নিজস্ব তত্বাবধানে যত্নের সাথে মোড়কজাত করে পৌঁছে দিচ্ছি আপনার ঘরে। মূল্য: ২২০০ টাকা প্রতি কেজি।',
    stock_status: 'in_stock',
    keywords: ['মেডজুল খেজুর', 'মেডজুল', 'সৌদি খেজুর', 'সৌদি আরব', 'medjool dates', 'medjool', 'medjul', 'medjool khejur', 'medjul khejur', 'medjool dates']
  },
  {
    name: 'আখের লাল চিনি (Organic Red Cane Sugar)',
    price: 250.00,
    description: 'আমাদের সুন্নাহ ফুড বিডি তে পেয়ে যাবেন আখের লাল চিনি। এটি ১০০% অর্গানিক এবং ভেজাল মুক্ত। মূল্য: ২৫০ টাকা প্রতি কেজি।',
    stock_status: 'in_stock',
    keywords: ['আখের লাল চিনি', 'আখের চিনি', 'লাল চিনি', 'চিনি', 'অর্গানিক চিনি', 'red sugar', 'cane sugar', 'sugar', 'akher chini', 'lal chini', 'chini']
  },
  {
    name: 'ফ্রেশ পেস্তা বাদাম (Fresh Pistachio Nuts)',
    price: 2850.00,
    description: 'দুবাই থেকে নিয়ে আসলাম ফ্রেশ পেস্তা বাদাম। মূল্য: ২৮৫০ টাকা প্রতি কেজি।',
    stock_status: 'in_stock',
    keywords: ['পেস্তা বাদাম', 'পেস্তাবাদাম', 'পেস্তা', 'বাদাম', 'দুবাই পেস্তা বাদাম', 'pistachio', 'pistachio nuts', 'pesta badam', 'badam', 'nuts']
  }
];

export async function seedProducts() {
  const client = await pool.connect();
  try {
    console.log('Seeding products catalog into database...');
    
    for (const prod of productsData) {
      // Check if product already exists by name
      const existing = await client.query('SELECT * FROM products WHERE name = $1', [prod.name]);
      if (existing.rows.length === 0) {
        await client.query(`
          INSERT INTO products (name, price, description, stock_status, keywords)
          VALUES ($1, $2, $3, $4, $5)
        `, [prod.name, prod.price, prod.description, prod.stock_status, prod.keywords]);
        console.log(`Inserted product: "${prod.name}" - ${prod.price} BDT`);
      } else {
        // Update existing product details & keywords
        await client.query(`
          UPDATE products
          SET price = $1, description = $2, stock_status = $3, keywords = $4
          WHERE id = $5
        `, [prod.price, prod.description, prod.stock_status, prod.keywords, existing.rows[0].id]);
        console.log(`Updated product: "${prod.name}"`);
      }
    }

    // Link all products to all users in user_products table
    await client.query(`
      INSERT INTO user_products (user_id, product_id)
      SELECT u.id, p.id 
      FROM users u
      CROSS JOIN products p
      WHERE NOT EXISTS (
        SELECT 1 FROM user_products up 
        WHERE up.user_id = u.id AND up.product_id = p.id
      )
    `);
    console.log('Mapped all catalog products to all user dashboards in user_products.');
    
    console.log('Product catalog seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding products:', error);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedProducts().then(() => {
    process.exit(0);
  });
}
