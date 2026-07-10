import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';

const AUDIO_DIR = path.join(__dirname, '../../public/audio');

// Ensure output directory exists
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

/**
 * Split text into chunks smaller than 180 characters (useful for free Google TTS limit)
 */
function splitTextIntoChunks(text: string, maxLength: number = 180): string[] {
  const words = text.split(' ');
  const chunks: string[] = [];
  let currentChunk = '';

  for (const word of words) {
    if ((currentChunk + ' ' + word).trim().length <= maxLength) {
      currentChunk = (currentChunk + ' ' + word).trim();
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = word;
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

/**
 * Generate an MP3 voice file of the given text.
 * Returns the public URL path (e.g., /audio/filename.mp3)
 */
export async function generateVoice(
  text: string, 
  provider: string = 'google', 
  apiKey?: string, 
  language: string = 'bn'
): Promise<string> {
  const filename = `voice-${crypto.randomUUID()}.mp3`;
  const filePath = path.join(AUDIO_DIR, filename);

  console.log(`[VoiceService] Generating voice using ${provider} in language "${language}"...`);

  // Clean the text from emojis and markdown formatting
  const cleanText = text
    .replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '') // strip emojis
    .replace(/[\*\_\[\]\(\)\#\-\`]/g, ' ') // strip markdown formatting characters
    .trim();

  if (!cleanText) {
    throw new Error('No clean text content available to generate voice.');
  }

  if (provider === 'openai' && apiKey) {
    // OpenAI Speech API integration
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/audio/speech',
        {
          model: 'tts-1',
          input: cleanText,
          voice: 'alloy', // alloy, echo, fable, onyx, nova, shimmer
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        }
      );
      fs.writeFileSync(filePath, Buffer.from(response.data));
      return `/audio/${filename}`;
    } catch (error: any) {
      console.error('OpenAI TTS generation failed:', error.message || error);
      throw new Error(`OpenAI TTS generation failed: ${error.message}`);
    }
  } 
  
  if (provider === 'elevenlabs' && apiKey) {
    // ElevenLabs API integration (Rachel Voice ID: 21m00Tcm4TlvDq8ikWAM)
    try {
      const voiceId = '21m00Tcm4TlvDq8ikWAM';
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text: cleanText,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        },
        {
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        }
      );
      fs.writeFileSync(filePath, Buffer.from(response.data));
      return `/audio/${filename}`;
    } catch (error: any) {
      console.error('ElevenLabs TTS generation failed:', error.message || error);
      throw new Error(`ElevenLabs TTS generation failed: ${error.message}`);
    }
  }

  // Default / Fallback: Google Translate TTS (Free, works great for Bengali and English short text)
  try {
    const chunks = splitTextIntoChunks(cleanText, 180);
    const writeStream = fs.createWriteStream(filePath);

    for (const chunk of chunks) {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${language}&client=tw-ob&q=${encodeURIComponent(chunk)}`;
      const response = await axios.get(url, { responseType: 'stream' });
      
      response.data.pipe(writeStream, { end: false });
      
      // Wait for the stream chunk to write completely before starting next chunk
      await new Promise((resolve, reject) => {
        response.data.on('end', resolve);
        response.data.on('error', reject);
      });
    }
    
    writeStream.end();
    return `/audio/${filename}`;
  } catch (error: any) {
    console.error('Google Translate TTS generation failed:', error.message || error);
    throw new Error(`Google Translate TTS failed: ${error.message}`);
  }
}
