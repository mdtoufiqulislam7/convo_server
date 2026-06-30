import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const GRAPH_API_VERSION = 'v20.0';

export async function sendFacebookMessage(recipientPsid: string, messageText: string): Promise<void> {
  if (!FB_PAGE_ACCESS_TOKEN) {
    console.error('FB_PAGE_ACCESS_TOKEN is not defined in environment variables.');
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`;

  try {
    console.log(`Sending message to Meta Graph API for PSID: ${recipientPsid}...`);
    const response = await axios.post(
      url,
      {
        recipient: {
          id: recipientPsid,
        },
        message: {
          text: messageText,
        },
      },
      {
        params: {
          access_token: FB_PAGE_ACCESS_TOKEN,
        },
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`Message sent successfully. Meta response ID:`, response.data.message_id);
  } catch (error: any) {
    if (error.response) {
      console.error('Meta Graph API returned an error:', error.response.status, error.response.data);
    } else {
      console.error('Error sending message via Meta Graph API:', error.message);
    }
    throw error;
  }
}
