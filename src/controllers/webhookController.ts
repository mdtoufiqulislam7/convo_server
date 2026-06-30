import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { getAIResponse } from '../services/aiService';
import { sendFacebookMessage } from '../services/facebookService';
import { pool } from '../config/db';

dotenv.config();

const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

// Verification Endpoint (GET /api/webhook)
export async function verifyWebhook(req: Request, res: Response): Promise<void> {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
      console.log('Webhook verified successfully.');
      res.status(200).send(challenge);
    } else {
      console.warn('Webhook verification failed: token mismatch.');
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
}

// Listener Endpoint (POST /api/webhook)
export async function receiveWebhookEvent(req: Request, res: Response): Promise<void> {
  const body = req.body;

  // Check if this is an event from a page subscription
  if (body.object === 'page') {
    // Return a 200 OK response immediately to Meta (must respond within milliseconds)
    res.status(200).send('EVENT_RECEIVED');

    // Process the events asynchronously in the background
    body.entry.forEach(async (entry: any) => {
      // entry.messaging is an array containing the webhook event
      if (!entry.messaging) return;

      for (const webhookEvent of entry.messaging) {
        // Discard echoes to avoid infinite response loops
        if (webhookEvent.message && webhookEvent.message.is_echo) {
          console.log('Skipping echo message.');
          continue;
        }

        const senderPsid = webhookEvent.sender?.id;
        const messageText = webhookEvent.message?.text;

        if (senderPsid && messageText) {
          console.log(`Processing message from PSID ${senderPsid}: "${messageText}"`);

          // Execute smart lookup and AI analysis in the background
          try {
            const aiResponseText = await getAIResponse(messageText);
            console.log(`Generated response: "${aiResponseText}"`);

            // Send reply via Graph API (wrap in try-catch to keep it resilient)
            try {
              await sendFacebookMessage(senderPsid, aiResponseText);
            } catch (fbErr: any) {
              console.error('Failed to send message back to Facebook Graph API:', fbErr.message || fbErr);
            }

            // Log message history inside database
            await pool.query(
              `INSERT INTO chat_messages (sender_id, message_text, response_text) 
               VALUES ($1, $2, $3)`,
              [senderPsid, messageText, aiResponseText]
            );
            console.log(`Logged chat message history in DB.`);
          } catch (err) {
            console.error('Error handling background webhook processing:', err);
          }
        }
      }
    });
  } else {
    // Return a 404 if event is not from a page subscription
    res.sendStatus(404);
  }
}
