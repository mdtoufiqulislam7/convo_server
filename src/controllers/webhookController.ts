import { Request, Response } from 'express';
import dotenv from 'dotenv';
import { getAIResponse } from '../services/aiService';
import { sendFacebookMessage, sendFacebookAudioMessage } from '../services/facebookService';
import { generateVoice, transcribeAudio } from '../services/voiceService';
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
  console.log('Received webhook POST event payload:', JSON.stringify(body, null, 2));

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
        const recipientPageId = webhookEvent.recipient?.id;
        let messageText = webhookEvent.message?.text;
        const voiceAttachment = webhookEvent.message?.attachments?.find((att: any) => att.type === 'audio');

        if (senderPsid && (messageText || voiceAttachment)) {
          console.log(`Processing event from PSID ${senderPsid} to Page ${recipientPageId}. Has text: ${!!messageText}, Has audio: ${!!voiceAttachment}`);

          // Execute smart lookup and AI analysis in the background
          try {
            // Fetch page credentials settings dynamically to get access token and keys
            let pageAccessToken = undefined;
            let voiceEnabled = false;
            let voiceProvider = 'google';
            let voiceApiKey = undefined;
            let voiceLanguage = 'bn';

            if (recipientPageId) {
              const credsCheck = await pool.query(
                'SELECT * FROM page_credentials WHERE page_id = $1', 
                [recipientPageId]
              );
              if (credsCheck.rows.length > 0) {
                const creds = credsCheck.rows[0];
                pageAccessToken = creds.page_access_token;
                voiceEnabled = creds.voice_enabled;
                voiceProvider = creds.voice_provider;
                voiceApiKey = creds.voice_api_key;
                voiceLanguage = creds.voice_language;
              }
            }

            // If it's a voice message, download and transcribe it using Whisper
            if (voiceAttachment) {
              const audioUrl = voiceAttachment.payload?.url;
              const transcriptionKey = voiceApiKey || process.env.OPENAI_API_KEY;

              if (audioUrl && transcriptionKey) {
                try {
                  messageText = await transcribeAudio(audioUrl, transcriptionKey);
                  console.log(`Successfully transcribed user speech message: "${messageText}"`);
                } catch (transcribeErr: any) {
                  console.error('Failed to transcribe user voice note:', transcribeErr.message || transcribeErr);
                }
              }
            }

            // Fallback instructions if transcription was empty or key was missing
            if (!messageText) {
              try {
                const fallbackMsg = "আমরা আপনার ভয়েস মেসেজটি পেয়েছি। অনুগ্রহ করে আপনার বার্তাটি লিখে পাঠান যাতে আমাদের এআই অ্যাসিস্ট্যান্ট প্রোডাক্ট খুঁজে দিতে পারে।\n\n(We received your voice clip. Please type your message in text so our assistant can help you!)";
                await sendFacebookMessage(senderPsid, fallbackMsg, pageAccessToken);
              } catch (fbErr: any) {
                console.error('Failed to send fallback text message:', fbErr.message || fbErr);
              }
              return;
            }

            // Process text response
            const aiResponseText = await getAIResponse(messageText);
            console.log(`Generated response: "${aiResponseText}"`);

            // Send text reply via Graph API
            try {
              await sendFacebookMessage(senderPsid, aiResponseText, pageAccessToken);
            } catch (fbErr: any) {
              console.error('Failed to send text message back to Facebook Graph API:', fbErr.message || fbErr);
            }

            // Generate and send spoken audio message if enabled
            if (voiceEnabled && aiResponseText) {
              try {
                const audioPath = await generateVoice(aiResponseText, voiceProvider, voiceApiKey, voiceLanguage);
                const audioUrl = `https://api.convoes.app${audioPath}`;
                await sendFacebookAudioMessage(senderPsid, audioUrl, pageAccessToken);
              } catch (voiceErr: any) {
                console.error('Failed to send voice message back to Facebook Graph API:', voiceErr.message || voiceErr);
              }
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
