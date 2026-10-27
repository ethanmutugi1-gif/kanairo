// Speech-to-text fallback for browsers without the Web Speech API
// (Firefox, some Safari/iOS builds). The browser records a short clip and
// posts it here; a Gemini model on Netlify AI Gateway transcribes it.
//
// Request:  POST /api/transcribe  { media_type: "audio/webm", data: "<base64>" }
// Response: { text: "..." }

import { GoogleGenAI } from '@google/genai';

const STT_MODELS = ['gemini-3-flash-preview', 'gemini-flash-latest'];
const MAX_AUDIO_BASE64 = 5 * 1024 * 1024;

const ai = new GoogleGenAI({
  apiKey: process.env.NETLIFY_AI_GATEWAY_KEY,
  httpOptions: { baseUrl: process.env.NETLIFY_AI_GATEWAY_URL?.replace(/\/$/, '') }
});

export default async (req) => {
  if (req.method !== 'POST'){
    return Response.json({ error: { message: 'Method not allowed' } }, { status: 405 });
  }

  let body;
  try { body = await req.json(); } catch {
    return Response.json({ error: { message: 'Invalid JSON body.' } }, { status: 400 });
  }

  const mimeType = String(body.media_type || '').split(';')[0];
  if (!/^audio\/[\w.+-]+$/.test(mimeType) || typeof body.data !== 'string' || !body.data){
    return Response.json({ error: { message: 'No audio received.' } }, { status: 400 });
  }
  if (body.data.length > MAX_AUDIO_BASE64){
    return Response.json({ error: { message: 'That recording is too long — keep it under a minute or so.' } }, { status: 413 });
  }

  for (const model of STT_MODELS){
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{
          role: 'user',
          parts: [
            { text: 'Transcribe this speech exactly as spoken, in the original language. Reply with only the transcript text and nothing else. If there is no intelligible speech, reply with an empty string.' },
            { inlineData: { mimeType, data: body.data } }
          ]
        }]
      });
      const text = (response.text || '').trim().replace(/^["']|["']$/g, '');
      return Response.json({ text });
    } catch (err){
      console.error('transcribe: failed on', model, err && err.message);
    }
  }

  return Response.json({ error: { message: "Kanairo couldn't transcribe that recording." } }, { status: 502 });
};

export const config = {
  path: '/api/transcribe'
};
