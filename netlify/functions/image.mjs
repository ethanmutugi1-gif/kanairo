// Kanairo image generation, via Gemini image models on Netlify AI Gateway.
//
// Request:  POST /api/image  { prompt: string, image?: { media_type, data } }
//           `image` (optional, base64) is a reference picture to edit or restyle.
// Response: { image: "data:image/png;base64,...", text: "optional caption" }

import { GoogleGenAI } from '@google/genai';

const IMAGE_MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'];

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

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 4000) : '';
  if (!prompt){
    return Response.json({ error: { message: 'Describe the image you want.' } }, { status: 400 });
  }

  const parts = [{ text: prompt }];
  const ref = body.image;
  if (ref && typeof ref.data === 'string' && /^image\/[\w.+-]+$/.test(ref.media_type || '')){
    parts.push({ inlineData: { mimeType: ref.media_type, data: ref.data } });
  }

  let lastErr = null;
  for (const model of IMAGE_MODELS){
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }]
      });
      const outParts = response.candidates?.[0]?.content?.parts || [];
      const imagePart = outParts.find((p) => p.inlineData && p.inlineData.data);
      const text = outParts.filter((p) => p.text).map((p) => p.text).join('\n').trim();
      if (!imagePart){
        return Response.json({
          error: { message: text || "The image model didn't return a picture for that prompt — try rewording it." }
        }, { status: 422 });
      }
      return Response.json({
        image: 'data:' + (imagePart.inlineData.mimeType || 'image/png') + ';base64,' + imagePart.inlineData.data,
        text
      });
    } catch (err){
      lastErr = err;
      console.error('image: generation failed on', model, err && err.message);
    }
  }

  const status = (lastErr && lastErr.status) || 502;
  return Response.json({
    error: { message: status === 429 ? 'Image generation is busy right now — try again in a few seconds.' : "Kanairo couldn't generate that image just now." }
  }, { status });
};

export const config = {
  path: '/api/image'
};
