// Netlify Function — keeps your real OpenAI API key on the server, never in
// the browser. The front end calls "/api/chat" (redirected to this function
// by netlify.toml) instead of OpenAI directly.
//
// Setup:
// 1. Get an API key at https://platform.openai.com/api-keys
//    (never the one you paste in chat with anyone — always generate fresh)
// 2. In your Netlify site: Site configuration -> Environment variables, add:
//      OPENAI_API_KEY = <your real key>
// 3. Deploy. That's it — no other code changes needed.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: { message: 'Method not allowed' } })
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: { message: "Server is missing OPENAI_API_KEY. Add it in Netlify's Site configuration -> Environment variables." }
      })
    };
  }

  try {
    const payload = event.body;
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: payload
    });
    const data = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: { 'Content-Type': 'application/json' },
      body: data
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: 'Proxy request to OpenAI failed.' } })
    };
  }
};

