// Kanairo chat endpoint. Runs on Netlify AI Gateway, so no provider API key
// is needed — Netlify injects OpenAI credentials into this function at runtime.
//
// Request:  POST /api/chat  { model: "raptor1", messages: [...], think: bool, voice: bool }
// Response: newline-delimited JSON events, streamed as they arrive:
//   {"t":"r","d":"..."}   reasoning summary delta ("thinking")
//   {"t":"x","d":"..."}   answer text delta
//   {"t":"e","m":"..."}   error
//   {"t":"done","incomplete":bool}

import OpenAI from 'openai';
import { MODELS, FALLBACK_MODEL, BASE_PROMPT, VOICE_SUFFIX } from '../lib/models.mjs';

const openai = new OpenAI();

const MAX_MESSAGES = 40;
const MAX_TEXT_CHARS = 120000;

function toResponsesInput(messages){
  const recent = Array.isArray(messages) ? messages.slice(-MAX_MESSAGES) : [];
  const out = [];
  for (const m of recent){
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    if (typeof m.content === 'string'){
      const text = m.content.slice(0, MAX_TEXT_CHARS);
      if (text) out.push({ role: m.role, content: text });
      continue;
    }
    if (!Array.isArray(m.content) || m.role !== 'user') continue;
    const parts = [];
    for (let block of m.content){
      if (block && block.type === 'text' && typeof block.text === 'string'){
        parts.push({ type: 'input_text', text: block.text.slice(0, MAX_TEXT_CHARS) });
      } else if (block && block.type === 'image' && block.source && !block.media_type){
        block = { type: 'image', media_type: block.source.media_type, data: block.source.data };
      }
      if (block && block.type === 'image' && /^image\/[\w.+-]+$/.test(block.media_type || '') && typeof block.data === 'string'){
        parts.push({ type: 'input_image', detail: 'auto', image_url: 'data:' + block.media_type + ';base64,' + block.data });
      }
    }
    if (parts.length) out.push({ role: 'user', content: parts });
  }
  return out;
}

// Ask for the richest response first, then progressively drop optional
// features if the gateway or model rejects them (e.g. reasoning summaries
// need a verified OpenAI org; some models take no reasoning params at all).
function attemptsFor(cfg, think, voice){
  const effort = voice ? 'low' : (think ? cfg.thinkEffort : cfg.effort);
  const wantSummary = think && !voice;
  const list = [];
  if (wantSummary) list.push({ model: cfg.model, reasoning: { effort, summary: 'auto' } });
  list.push({ model: cfg.model, reasoning: { effort } });
  list.push({ model: cfg.model });
  if (cfg.model !== FALLBACK_MODEL){
    if (wantSummary) list.push({ model: FALLBACK_MODEL, reasoning: { effort, summary: 'auto' } });
    list.push({ model: FALLBACK_MODEL, reasoning: { effort } });
  }
  return list;
}

function isRetryable(err){
  const status = err && err.status;
  return status === 400 || status === 404 || status === 422;
}

export default async (req) => {
  if (req.method !== 'POST'){
    return Response.json({ error: { message: 'Method not allowed' } }, { status: 405 });
  }

  let body;
  try { body = await req.json(); } catch {
    return Response.json({ error: { message: 'Invalid JSON body.' } }, { status: 400 });
  }

  const cfg = MODELS[body.model] || MODELS.vito05;
  const think = Boolean(body.think);
  const voice = Boolean(body.voice);
  const input = toResponsesInput(body.messages);
  if (!input.length){
    return Response.json({ error: { message: 'No messages to send.' } }, { status: 400 });
  }

  const instructions = BASE_PROMPT + cfg.promptSuffix + (voice ? VOICE_SUFFIX : '');
  const maxOutputTokens = voice ? Math.min(cfg.maxOutputTokens, 2000) : cfg.maxOutputTokens;

  let stream = null;
  let lastErr = null;
  for (const attempt of attemptsFor(cfg, think, voice)){
    try {
      stream = await openai.responses.create({
        ...attempt,
        instructions,
        input,
        max_output_tokens: maxOutputTokens,
        stream: true,
        store: false
      });
      break;
    } catch (err){
      lastErr = err;
      if (!isRetryable(err)) break;
    }
  }

  if (!stream){
    const status = (lastErr && lastErr.status) || 502;
    console.error('chat: model request failed', status, lastErr && lastErr.message);
    const message = status === 429
      ? 'Kanairo is getting a lot of traffic right now — wait a few seconds and try again.'
      : 'The model request failed (' + status + ').';
    return Response.json({ error: { message } }, { status });
  }

  const encoder = new TextEncoder();
  const body$ = new ReadableStream({
    async start(controller){
      const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      let incomplete = false;
      let sawSummaryPart = false;
      try {
        for await (const event of stream){
          switch (event.type){
            case 'response.reasoning_summary_part.added':
              if (sawSummaryPart) send({ t: 'r', d: '\n\n' });
              sawSummaryPart = true;
              break;
            case 'response.reasoning_summary_text.delta':
              send({ t: 'r', d: event.delta });
              break;
            case 'response.output_text.delta':
              send({ t: 'x', d: event.delta });
              break;
            case 'response.incomplete':
              incomplete = true;
              break;
            case 'response.failed':
              send({ t: 'e', m: (event.response && event.response.error && event.response.error.message) || 'The model failed to finish this answer.' });
              break;
            case 'error':
              send({ t: 'e', m: event.message || 'The model stream reported an error.' });
              break;
          }
        }
      } catch (err){
        console.error('chat: stream error', err && err.message);
        send({ t: 'e', m: 'The connection to the model dropped mid-answer.' });
      }
      send({ t: 'done', incomplete });
      controller.close();
    }
  });

  return new Response(body$, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
};

export const config = {
  path: '/api/chat'
};
