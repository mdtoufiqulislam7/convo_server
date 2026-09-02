import { pool } from '../config/db';
import { OpenAI } from 'openai';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { processOrderSubmission } from './orderService';
import { getCache, setCache } from '../config/redis';

dotenv.config();

const SYSTEM_PROMPT = `You are a helpful, professional customer support AI assistant for a Facebook Page "Sunnah Food Bd".
Your goal is to answer customer questions accurately, politely, and helpfully based on the product catalog context provided.

Guidelines:
1. Always respond in the same language the customer uses (e.g., Bengali or English).
2. If the user's message matches any products in our database, use those specific product details (name, price, description, stock status) to answer their question accurately.
3. **Fixed Price Policy (একদাম নীতি)**: If the user asks for a discount, to reduce the price, or says "price kom rakha jabe?" (প্রাইজ কম রাখা যাবে?), answer politely that **our prices are fixed and non-negotiable** because we do not compromise on the premium organic quality of our foods. Explain that we prioritize 100% premium quality (১০০% প্রিমিয়াম কোয়ালিটি).
4. **Delivery Policy (ডেলিভারি সংক্রান্ত তথ্য)**: If the user asks when they will receive the product ("delivery diya jabe kobe / delivery kobe pabo?"), explain that:
   - Inside Dhaka: Delivery takes 1 to 2 days (১-২ দিন).
   - Outside Dhaka: Delivery takes 3 to 4 days (৩-৪ দিন).
   - Delivery is Cash on Delivery (ক্যাশ অন ডেলিভারি). Customers can inspect the product quality before paying.
5. **Product Order Procedure (অর্ডার করার প্রক্রিয়া)**: 
   - Whenever the customer asks or expresses interest in ordering a product (e.g., "অর্ডার করতে চাই", "আমি নিতে চাই", "কীভাবে অর্ডার করব", "I want to order", "Order this"):
   - If matching product(s) are present in the catalog context, state the product name and price FIRST in this exact format:
     '"[Product Name]" এর দাম প্রতি কেজি/লিটার [Price] টাকা।' (If a specific quantity was requested like 5 kg, state the total price calculation as well).
   - Then immediately follow with the form template below:

অর্ডারটি নিশ্চিত করতে অনুগ্রহ করে নিচের তথ্যগুলো পূরণ করে দিন:

নাম:

মোবাইল নম্বর:

ইমেইল (যদি থাকে):

সম্পূর্ণ ঠিকানা:

থানা/উপজেলা:

জেলা:

6. Keep answers concise, friendly, and suitable for a chat conversation (avoid extremely long paragraphs, use spacing and bullet points where helpful).
7. If no matching products are found, answer their general questions politely, representing the store professionally.
8. **Owner Information (মালিক সংক্রান্ত তথ্য)**: If anyone asks who the owner, founder, developer, or creator is (e.g., "who is your owner?", "owner ke?", "মালিক কে?"), respond with:
Owner name: Md Toufiqul Islam
info: http://mdtoufiq.netlify.app/
9. **Quantity & Total Price Calculation (পরিমাণ ও মোট মূল্য হিসাব)**:
   - If the customer asks for a specific quantity (e.g., 1 kg, 5 kg, 500 gm, 2 liters, 3 kg, etc.):
     - State the per-unit price (per kg/liter) from the product catalog.
     - Calculate and explicitly state the TOTAL price for the requested quantity (e.g., for 5 kg ghee at 1600 BDT/kg: "১ কেজির দাম ১৬০০ টাকা। সুতরাং ৫ কেজির মোট দাম = ১৬০০ × ৫ = ৮০০০ টাকা।").`;

function cleanMessageForSearch(text: string): { searchMessage: string; detectedQuantity?: string } {
  // Regex to detect quantity expressions like "5kg", "5 kg", "500gm", "2 liter", "১ কেজি", "৫ কেজি"
  const qtyRegex = /(?:(\d+(?:\.\d+)?|[০-৯]+(?:\.[০-৯]+)?)\s*(?:kg|কেজি|g|gm|gram|গ্রাম|liter|litre|লিটার|l|পিস|টি))/gi;
  const matches = text.match(qtyRegex);
  
  const detectedQuantity = matches ? matches.join(', ') : undefined;
  
  // Remove quantity expressions from SQL search message so matching isn't hindered
  let searchMessage = text.replace(qtyRegex, ' ').replace(/\s+/g, ' ').trim();
  if (!searchMessage || searchMessage.length < 2) {
    searchMessage = text;
  }
  
  return { searchMessage, detectedQuantity };
}

export async function getAIResponse(userMessage: string, userId?: number, senderId?: string): Promise<string> {
  // First, check if the customer is submitting completed order information
  try {
    const orderResult = await processOrderSubmission(userMessage, senderId);
    if (orderResult.isOrder && orderResult.responseText) {
      return orderResult.responseText;
    }
  } catch (orderErr) {
    console.error('Error checking order submission in aiService:', orderErr);
  }

  const { searchMessage, detectedQuantity } = cleanMessageForSearch(userMessage);

  let catalogContext = '';
  
  try {
    let dbResult;
    if (userId) {
      // 1. Primary lookup on mapped products for this user, ranked by maximum keyword match length
      dbResult = await pool.query(
        `SELECT p.*, MAX(LENGTH(kw.val)) as max_kw_len
         FROM products p
         JOIN user_products up ON p.id = up.product_id
         CROSS JOIN unnest(p.keywords) AS kw(val)
         WHERE up.user_id = $1
         AND p.keywords IS NOT NULL 
         AND $2 ILIKE '%' || kw.val || '%'
         GROUP BY p.id
         ORDER BY max_kw_len DESC, p.id ASC`,
        [userId, searchMessage]
      );
    }

    // 2. Global fallback lookup if user-specific query returned 0 rows or userId was not provided
    if (!dbResult || dbResult.rows.length === 0) {
      dbResult = await pool.query(
        `SELECT p.*, MAX(LENGTH(kw.val)) as max_kw_len
         FROM products p
         CROSS JOIN unnest(p.keywords) AS kw(val)
         WHERE p.keywords IS NOT NULL 
         AND $1 ILIKE '%' || kw.val || '%'
         GROUP BY p.id
         ORDER BY max_kw_len DESC, p.id ASC`,
        [searchMessage]
      );
    }

    if (dbResult.rows.length > 0) {
      // Filter out low-relevance generic matches if a high-relevance match exists
      const topMatchLen = parseInt(dbResult.rows[0].max_kw_len, 10);
      const filteredRows = dbResult.rows.filter((row: any) => {
        const len = parseInt(row.max_kw_len, 10);
        return topMatchLen >= 6 ? len >= (topMatchLen - 3) : true;
      });

      catalogContext = 'Matching Product Catalog Items:\n' + filteredRows.map((row: any) => {
        return `- ID: ${row.id}
  Name: ${row.name}
  Price: ${row.price} BDT
  Description: ${row.description}
  Stock Status: ${row.stock_status}`;
      }).join('\n\n');

      if (detectedQuantity) {
        catalogContext += `\n\nCustomer Requested Quantity: "${detectedQuantity}". Please state the unit price AND calculate the TOTAL price for this quantity.`;
      }

      console.log(`Smart Ranked Lookup found ${filteredRows.length} relevant product(s) (Top match len: ${topMatchLen}, Requested Qty: ${detectedQuantity || 'none'}) for user ID ${userId || 'global'}.`);
    } else {
      catalogContext = 'No matching product catalog items found in the database.';
      console.log('Smart Lookup did not match any products.');
    }
  } catch (error) {
    console.error('Error querying products database:', error);
    catalogContext = 'Database query failed (using default store knowledge).';
  }

  // Check if OpenAI and Gemini keys are available
  let openAIKey = process.env.OPENAI_API_KEY;
  let geminiKey = process.env.GEMINI_API_KEY || process.env.aistudioapi;

  // Auto-detect if user supplied the Google AI Studio key inside the OPENAI_API_KEY slot
  if (openAIKey && (openAIKey.startsWith('AQ.') || openAIKey.startsWith('AIzaSy'))) {
    console.log('Detected Google AI Studio API key in OPENAI_API_KEY. Routing to Gemini SDK.');
    if (!geminiKey) {
      geminiKey = openAIKey;
    }
    openAIKey = undefined;
  }

  if (openAIKey) {
    try {
      console.log('Executing LLM completion using OpenAI (gpt-4o)...');
      const openai = new OpenAI({ apiKey: openAIKey });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Catalog Context:\n${catalogContext}\n\nCustomer Message: ${userMessage}` }
        ],
        temperature: 0.7,
      });
      return completion.choices[0].message?.content || 'Thank you for your message! We will get back to you shortly.';
    } catch (openaiErr) {
      console.error('OpenAI Error, falling back to Gemini if available:', openaiErr);
    }
  }

  if (geminiKey) {
    try {
      console.log('Executing LLM completion using Google GenAI (gemini-2.5-flash-lite)...');
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: `System Prompt:\n${SYSTEM_PROMPT}\n\nCatalog Context:\n${catalogContext}\n\nCustomer Message: ${userMessage}`,
      });
      return response.text || 'Thank you for your message! We will get back to you shortly.';
    } catch (geminiErr) {
      console.error('Gemini SDK Error:', geminiErr);
    }
  }

  // Fallback if no keys or LLMs failed
  return 'Thank you for your message. We have received it and will respond to you soon!';
}
