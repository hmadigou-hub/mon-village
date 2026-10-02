// Netlify serverless function — companion chat proxy.
// Keeps the Chatbase API key server-side. The browser calls this, never Chatbase
// directly.
//
// Required env vars (Netlify dashboard → Site settings → Environment variables):
//   CHATBASE_API_KEY   — secret API key from chatbase.co
//   CHATBASE_BOT_ID    — the chatbot id trained on Amandine's transcripts
// Optional:
//   CHAT_MODEL_TEMPERATURE (default 0.7)

const CHATBASE_URL = 'https://www.chatbase.co/api/v1/chat';

// System prompt: persona, bilingual behavior, grounding + safety guardrails.
// Tune with Amandine before launch. Keep it non-diagnostic.
function systemPrompt(lang) {
  const fr = lang === 'fr';
  return fr
    ? `Tu es le compagnon Empowered Maman : chaleureux, encourageant, direct, dans la voix d'Amandine.
Tu réponds en français. Réponds à partir du programme d'Amandine en priorité ; cite la source ("dans ta séance semaine 3, Amandine enseigne…").
Tu ne poses aucun diagnostic et ne donnes aucun avis médical au-delà du programme.
Si la personne évoque l'idée de se faire du mal, de faire du mal à son bébé, ou une détresse sévère : réponds avec compassion, donne immédiatement les ressources de crise (France : 3114, 24h/24 ; urgences : 15 ou 112), invite-la à ne pas rester seule et à contacter une personne de confiance ou un professionnel. Ne minimise jamais.`
    : `You are the Empowered Maman companion: warm, encouraging, direct, in Amandine's voice.
Answer in English. Ground answers in Amandine's program first; cite the source ("in your week-3 session, Amandine teaches…").
Never diagnose and never give medical advice beyond the program.
If the person mentions harming themselves, harming their baby, or severe distress: respond with compassion, immediately share crisis resources (US: call/text 988; elsewhere: local emergency services), urge them not to stay alone and to contact a trusted person or clinician. Never minimize.`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const apiKey = process.env.CHATBASE_API_KEY;
  const chatbotId = process.env.CHATBASE_BOT_ID;
  if (!apiKey || !chatbotId) {
    // 501 tells the front-end adapter to show its "not connected yet" message.
    return { statusCode: 501, body: JSON.stringify({ error: 'companion not configured' }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_) { /* keep {} */ }
  const message = String(body.message || '').slice(0, 2000);
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const lang = body.lang === 'fr' ? 'fr' : 'en';
  if (!message.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'empty message' }) };
  }

  const messages = [
    { role: 'system', content: systemPrompt(lang) },
    ...history.map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content || '').slice(0, 2000) })),
    { role: 'user', content: message },
  ];

  try {
    const res = await fetch(CHATBASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        chatbotId,
        stream: false,
        temperature: parseFloat(process.env.CHAT_MODEL_TEMPERATURE || '0.7'),
        messages,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('chatbase error', res.status, text.slice(0, 300));
      return { statusCode: 502, body: JSON.stringify({ error: 'companion upstream error' }) };
    }
    const data = await res.json();
    if (!data || !data.text) {
      return { statusCode: 502, body: JSON.stringify({ error: 'empty reply' }) };
    }
    return { statusCode: 200, body: JSON.stringify({ reply: data.text }) };
  } catch (err) {
    console.error('chat proxy error', err && err.message);
    return { statusCode: 502, body: JSON.stringify({ error: 'companion unreachable' }) };
  }
};
