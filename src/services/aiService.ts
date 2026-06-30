import { pool } from '../config/db';
import { OpenAI } from 'openai';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const SYSTEM_PROMPT = `You are a helpful, professional customer support AI assistant for a Facebook Page.
Your goal is to answer customer questions accurately and politely based on the product catalog context provided.

Guidelines:
1. Always respond in the same language the customer uses (e.g., Bengali or English).
2. If the user's message matches any products in our database, use those product details (name, price, description, stock status) to answer their question.
3. If the user wants to order, guide them to write their full address and mobile phone number, or call 01866733279. Note that Cash on Delivery is available with 100% premium quality check.
4. Keep answers concise, friendly, and suitable for a chat conversation (avoid extremely long paragraphs, use spacing and bullet points where helpful).
5. If no matching products are found, answer their general questions politely, representing the store professionally.`;

export async function getAIResponse(userMessage: string): Promise<string> {
  let catalogContext = '';
  
  try {
    // Perform a text lookup on our PostgreSQL products table using the user's text keywords
    const dbResult = await pool.query(
      `SELECT * FROM products 
       WHERE keywords IS NOT NULL 
       AND EXISTS (
         SELECT 1 FROM unnest(keywords) AS kw 
         WHERE $1 ILIKE '%' || kw || '%'
       )`,
      [userMessage]
    );

    if (dbResult.rows.length > 0) {
      catalogContext = 'Matching Product Catalog Items:\n' + dbResult.rows.map((row: any) => {
        return `- ID: ${row.id}
  Name: ${row.name}
  Price: ${row.price} BDT
  Description: ${row.description}
  Stock Status: ${row.stock_status}`;
      }).join('\n\n');
      console.log(`Smart Lookup found ${dbResult.rows.length} product(s).`);
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
