import { pool } from '../config/db';
import { sendOrderConfirmationEmail } from './emailService';
import { GoogleGenAI } from '@google/genai';
import { OpenAI } from 'openai';

export interface ExtractedOrderData {
  customerName?: string;
  phone?: string;
  email?: string;
  fullAddress?: string;
  thanaUpazila?: string;
  district?: string;
}

export function parseOrderTextRegex(text: string): ExtractedOrderData | null {
  if (!text) return null;

  const data: ExtractedOrderData = {};
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Match Name
    const nameMatch = line.match(/^(?:নাম|Name)\s*[:|-]\s*(.+)$/i);
    if (nameMatch && nameMatch[1] && !data.customerName) {
      const val = nameMatch[1].trim();
      if (val && !val.includes('অর্ডারটি নিশ্চিত করতে') && !val.includes('নিচের তথ্যগুলো')) {
        data.customerName = val;
      }
    }

    // Match Phone
    const phoneMatch = line.match(/^(?:মোবাইল\s*নম্বর|মোবাইল|ফোন|Phone|Mobile)\s*[:|-]\s*(.+)$/i);
    if (phoneMatch && phoneMatch[1] && !data.phone) {
      let val = phoneMatch[1].trim();
      if (val) data.phone = val;
    }

    // Match Email
    const emailMatch = line.match(/^(?:ইমেইল\s*(?:\(যদি\s*থাকে\))?|ইমেইল|Email)\s*[:|-]\s*(.+)$/i);
    if (emailMatch && emailMatch[1] && !data.email) {
      let val = emailMatch[1].trim();
      if (val.includes('@')) {
        data.email = val;
      }
    }

    // Match Address
    const addressMatch = line.match(/^(?:সম্পূর্ণ\s*ঠিকানা|ঠিকানা|Address|Full\s*Address)\s*[:|-]\s*(.+)$/i);
    if (addressMatch && addressMatch[1] && !data.fullAddress) {
      let val = addressMatch[1].trim();
      if (val) data.fullAddress = val;
    }

    // Match Thana/Upazila
    const thanaMatch = line.match(/^(?:থানা\/উপজেলা|থানা|উপজেলা|Thana|Upazila)\s*[:|-]\s*(.+)$/i);
    if (thanaMatch && thanaMatch[1] && !data.thanaUpazila) {
      let val = thanaMatch[1].trim();
      if (val) data.thanaUpazila = val;
    }

    // Match District
    const districtMatch = line.match(/^(?:জেলা|District)\s*[:|-]\s*(.+)$/i);
    if (districtMatch && districtMatch[1] && !data.district) {
      let val = districtMatch[1].trim();
      if (val) data.district = val;
    }
  }

  // Fallbacks for Phone and Email if missing from Key-Value
  if (!data.phone) {
    const rawPhoneMatch = text.match(/(?:01[3-9]\d{8}|\+?8801[3-9]\d{8})/);
    if (rawPhoneMatch) {
      data.phone = rawPhoneMatch[0];
    }
  }

  if (!data.email) {
    const rawEmailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (rawEmailMatch) {
      data.email = rawEmailMatch[0];
    }
  }

  // Only return regex match if we have all 3 critical fields (customerName, phone, fullAddress)
  if (data.phone && data.customerName && data.fullAddress) {
    return data;
  }

  return null;
}

export async function extractOrderDataWithLLM(text: string): Promise<ExtractedOrderData | null> {
  let openAIKey = process.env.OPENAI_API_KEY;
  let geminiKey = process.env.GEMINI_API_KEY || process.env.aistudioapi;

  if (openAIKey && (openAIKey.startsWith('AQ.') || openAIKey.startsWith('AIzaSy'))) {
    if (!geminiKey) geminiKey = openAIKey;
    openAIKey = undefined;
  }

  const prompt = `You are a smart order extraction system for an e-commerce store.
Analyze the customer's message below to determine if it contains order submission details (such as customer name, mobile phone number, delivery address, email, thana/upazila, district).

Customer Message:
"""
${text}
"""

If the message contains customer order details (such as phone number or name or address):
Return ONLY a valid JSON object in this exact format (no markdown formatting, no extra explanation):
{
  "isOrder": true,
  "customerName": "extracted name or empty string",
  "phone": "extracted phone number or empty string",
  "email": "extracted email or empty string",
  "fullAddress": "extracted full address or empty string",
  "thanaUpazila": "extracted thana or upazila or empty string",
  "district": "extracted district or empty string"
}

If the message is NOT an order submission (for example, just asking "price koto?" or "I want to order"):
Return ONLY:
{
  "isOrder": false
}`;

  try {
    let jsonString = '';
    if (geminiKey) {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: prompt,
      });
      jsonString = response.text || '';
    } else if (openAIKey) {
      const openai = new OpenAI({ apiKey: openAIKey });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      });
      jsonString = completion.choices[0].message?.content || '';
    }

    jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
    if (jsonString.startsWith('{')) {
      const parsed = JSON.parse(jsonString);
      if (parsed.isOrder) {
        return {
          customerName: parsed.customerName || undefined,
          phone: parsed.phone || undefined,
          email: parsed.email || undefined,
          fullAddress: parsed.fullAddress || undefined,
          thanaUpazila: parsed.thanaUpazila || undefined,
          district: parsed.district || undefined,
        };
      }
    }
  } catch (err) {
    console.error('LLM Order Extraction error:', err);
  }
  return null;
}

export async function processOrderSubmission(
  messageText: string,
  senderId?: string
): Promise<{ isOrder: boolean; orderId?: number; responseText?: string }> {
  // 1. Try fast Regex extraction
  let orderData = parseOrderTextRegex(messageText);

  // 2. If regex did not extract all key fields, use LLM extraction
  const hasPhone = /(?:01[3-9]\d{8}|\+?8801[3-9]\d{8})/.test(messageText);
  const hasFormKeywords = /নাম|মোবাইল|ঠিকানা|ইমেইল|জেলা|থানা/i.test(messageText);

  if (!orderData && (hasPhone || hasFormKeywords)) {
    console.log('Regex order parsing incomplete. Running LLM Order Extractor...');
    orderData = await extractOrderDataWithLLM(messageText);
  }

  if (!orderData || (!orderData.phone && !orderData.fullAddress && !orderData.customerName)) {
    return { isOrder: false };
  }

  const customerName = orderData.customerName?.trim();
  const phone = orderData.phone?.trim();
  const email = orderData.email?.trim() || '';
  let fullAddress = orderData.fullAddress?.trim() || '';
  const thanaUpazila = orderData.thanaUpazila?.trim() || '';
  const district = orderData.district?.trim() || '';

  // If thana/district are present but fullAddress is short, combine them into fullAddress
  if (!fullAddress && (thanaUpazila || district)) {
    fullAddress = [thanaUpazila, district].filter(Boolean).join(', ');
  }

  // Check if order details are complete (MUST have customerName, phone, AND fullAddress)
  const isComplete = Boolean(customerName && phone && fullAddress && fullAddress !== 'N/A' && fullAddress.length >= 3);

  if (!isComplete) {
    console.log(`Incomplete order submission detected from user (Name: ${customerName}, Phone: ${phone}, Address: ${fullAddress}). Requesting missing details...`);
    const promptResponse = `অর্ডারটি নিশ্চিত করতে অনুগ্রহ করে আপনার সকল তথ্য (নাম, মোবাইল নম্বর এবং সম্পূর্ণ ঠিকানা) প্রদান করুন:\n\nঅর্ডারটি নিশ্চিত করতে অনুগ্রহ করে নিচের তথ্যগুলো পূরণ করে দিন:\n\nনাম:\n\nমোবাইল নম্বর:\n\nইমেইল (যদি থাকে):\n\nসম্পূর্ণ ঠিকানা:\n\nথানা/উপজেলা:\n\nজেলা:`;
    return {
      isOrder: true,
      responseText: promptResponse,
    };
  }

  try {
    const result = await pool.query(
      `INSERT INTO product_orders (sender_id, customer_name, phone, email, full_address, thana_upazila, district, raw_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [senderId || null, customerName, phone, email, fullAddress, thanaUpazila, district, messageText]
    );

    const newOrder = result.rows[0];
    const orderId = newOrder.id;

    console.log(`Successfully saved order #${orderId} for ${customerName} (${phone}) into product_orders table.`);

    // If customer provided an email address, send confirmation email via Nodemailer
    let emailStatusMessage = '';
    if (email && email.includes('@')) {
      const emailSent = await sendOrderConfirmationEmail({
        orderId,
        customerName: customerName!,
        phone: phone!,
        email,
        fullAddress,
        thanaUpazila,
        district,
      });
      if (emailSent) {
        emailStatusMessage = `\n\nআপনার ইমেইল (${email})-এ একটি নিশ্চয়তা বার্তা (Order Confirmation Email) পাঠানো হয়েছে।`;
      }
    }

    const responseText = `আপনার তথ্য প্রদানের জন্য ধন্যবাদ! আপনার অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে। 🎉\n\nঅর্ডার নং: #${orderId}\nনাম: ${customerName}\nমোবাইল নম্বর: ${phone}\nঠিকানা: ${fullAddress}${emailStatusMessage}\n\nআমাদের প্রতিনিধি ডেলিভারির জন্য দ্রুত আপনার সাথে যোগাযোগ করবেন। Sunnah Food BD-এর সাথে থাকার জন্য ধন্যবাদ!`;

    return {
      isOrder: true,
      orderId,
      responseText,
    };
  } catch (error) {
    console.error('Error saving order into product_orders table:', error);
    return {
      isOrder: false,
    };
  }
}
