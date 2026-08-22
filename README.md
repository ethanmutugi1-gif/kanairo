# Kanairo AI — deploy instructions (Netlify + OpenAI)

This folder is ready to deploy straight to **Netlify** (free tier is enough).
GitHub Pages alone can't run this because it needs a tiny backend function
(`netlify/functions/chat.js`) to hold your real OpenAI API key — GitHub Pages
only serves static files, no backend code.

## What's in here

- `index.html` — the app. Calls `/api/chat` (never OpenAI directly).
- `netlify/functions/chat.js` — a small server function that adds your real
  API key and forwards the request to OpenAI. The key never reaches the browser.
- `netlify.toml` — tells Netlify where the function lives and redirects
  `/api/chat` to it.

## 1. Get a fresh API key

Go to https://platform.openai.com/api-keys and generate a **new** key.
(If you shared a key anywhere before this — chat, code, a screenshot —
revoke it there first. Treat any key that's been typed out loud as burned.)

## 2. Push this folder to GitHub

1. Create a repo at https://github.com/new
2. Drag all these files/folders into it via "Add file → Upload files"
   (keep the `netlify` folder structure intact — `netlify/functions/chat.js`)

## 3. Deploy on Netlify

1. Go to https://app.netlify.com → "Add new site" → "Import an existing project"
2. Connect the GitHub repo you just made
3. Build settings: leave them as default — `netlify.toml` already tells
   Netlify everything it needs
4. Before (or right after) deploying, go to **Site configuration → Environment
   variables** and add:
   - Key: `OPENAI_API_KEY`
   - Value: the key you generated in step 1
5. Deploy. Netlify gives you a live URL (e.g. `kanairo.netlify.app`) and
   redeploys automatically every time you push to GitHub.

## Stripe (real payments)

Open `index.html`, search for `STRIPE_LINKS` near the top of the `<script>`
tag, and paste in your own Stripe Payment Link URLs (see the comment right
above it for exact steps). Until those are filled in, the plan buttons will
say the checkout isn't connected yet — they won't unlock anything for free.

## Security notes

- `OPENAI_API_KEY` lives only in Netlify's environment variables — it's
  never sent to the browser and never appears in `index.html`.
- Don't commit an API key into any file in this repo, ever.
- The model names used (`gpt-4o`, `gpt-4o-mini`) were current at the time
  this was built — if OpenAI has newer models by the time you deploy, swap
  the `apiModel` values in `index.html`'s `MODELS` config.
