import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const GRAPH_API_VERSION = 'v20.0';

export async function sendFacebookMessage(recipientPsid: string, messageText: string, customToken?: string): Promise<void> {
  const token = customToken || FB_PAGE_ACCESS_TOKEN;
  if (!token) {
    console.error('Page Access Token is not defined.');
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`;

  try {
    console.log(`Sending text message to Meta Graph API for PSID: ${recipientPsid}...`);
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
          access_token: token,
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

export async function sendFacebookAudioMessage(recipientPsid: string, audioUrl: string, customToken?: string): Promise<void> {
  const token = customToken || FB_PAGE_ACCESS_TOKEN;
  if (!token) {
    console.error('Page Access Token is not defined.');
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`;

  try {
    console.log(`Sending audio message to Meta Graph API for PSID: ${recipientPsid}...`);
    const response = await axios.post(
      url,
      {
        recipient: {
          id: recipientPsid,
        },
        message: {
          attachment: {
            type: 'audio',
            payload: {
              url: audioUrl,
              is_reusable: true
            }
          }
        },
      },
      {
        params: {
          access_token: token,
        },
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`Audio message sent successfully. Meta response ID:`, response.data.message_id);
  } catch (error: any) {
    if (error.response) {
      console.error('Meta Graph API returned an error for audio:', error.response.status, error.response.data);
    } else {
      console.error('Error sending audio message via Meta Graph API:', error.message);
    }
    throw error;
  }
}
