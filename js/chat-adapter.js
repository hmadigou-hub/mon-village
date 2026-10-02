/* ============================================================================
 * Empowered Maman — companion chat adapter (v1)
 *
 * Bridges the prototype's chat UI to a real AI companion backend.
 * The quick-reply chips keep their scripted answers; free-text messages go to
 * the companion API. A client-side crisis tripwire reuses the prototype's own
 * crisis panel (crisisHTML) as an immediate backstop — it never depends on the
 * network. The system prompt on the backend carries the main safety guardrails.
 *
 * HOW TO CONNECT (2 minutes):
 *   Recommended: deploy with the included Netlify function (netlify/functions/
 *   chat.js), set the CHATBASE_API_KEY + CHATBASE_BOT_ID env vars in Netlify,
 *   and leave provider: 'proxy' below. The key never touches the browser.
 *   Quick local test: provider: 'chatbase' with your key + bot id inline.
 *   WARNING: a key written below is visible to anyone who opens the page.
 *   Use it for local testing only, then switch to 'proxy'.
 * ========================================================================== */
(function () {
  'use strict';

  var CONFIG = {
    provider: 'proxy',          // 'proxy' | 'chatbase'
    proxyUrl: '/.netlify/functions/chat',
    chatbase: {
      apiKey: '',               // local testing only — see warning above
      chatbotId: '',
      endpoint: 'https://www.chatbase.co/api/v1/chat'
    },
    maxHistory: 10              // exchanges of context sent with each request
  };

  /* ---------- tiny i18n for adapter strings ---------- */
  function lang() {
    try { return (window.state && window.state.lang) || 'en'; } catch (e) { return 'en'; }
  }
  var STR = {
    en: {
      placeholder: 'Write a message…',
      thinking: '…',
      notConfigured: 'The companion is not connected yet — add your API key to go live.',
      error: 'Hmm, I could not reach the companion just now. Please try again in a moment.'
    },
    fr: {
      placeholder: 'Écrivez un message…',
      thinking: '…',
      notConfigured: 'Le compagnon n’est pas encore connecté — ajoutez votre clé API pour le mettre en ligne.',
      error: 'Hmm, impossible de joindre le compagnon pour le moment. Réessayez dans un instant.'
    }
  };
  function t(key) { var s = STR[lang()] || STR.en; return s[key] || STR.en[key]; }

  /* ---------- crisis tripwire (backstop; system prompt is the main guard) --- */
  var CRISIS_WORDS = [
    'suicide', 'kill myself', 'end my life', "don't want to live", 'dont want to live',
    'hurt myself', 'hurt my baby', 'harming myself', 'self-harm', 'self harm',
    'me suicider', 'envie de mourir', 'mettre fin à mes jours', 'me faire du mal',
    'faire du mal à mon bébé', 'faire du mal a mon bebe'
  ];
  function looksLikeCrisis(text) {
    var low = ' ' + String(text).toLowerCase() + ' ';
    return CRISIS_WORDS.some(function (w) { return low.indexOf(w) !== -1; });
  }

  /* ---------- helpers that reuse the prototype's own UI --------------------- */
  function q(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function messagesEl() { return q('#messages'); }
  function addUserBubble(text) {
    var m = messagesEl();
    m.insertAdjacentHTML('beforeend', '<div class="bubble user"><p>' + esc(text) + '</p></div>');
    m.scrollTop = m.scrollHeight;
  }
  function addBotBubble(text) {
    var m = messagesEl();
    m.insertAdjacentHTML('beforeend', '<div class="bubble bot"><p>' + esc(text) + '</p></div>');
    m.scrollTop = m.scrollHeight;
  }
  function addTyping() {
    var m = messagesEl();
    m.insertAdjacentHTML('beforeend', '<div class="bubble bot typing" id="typingBubble"><p>' + t('thinking') + '</p></div>');
    m.scrollTop = m.scrollHeight;
  }
  function removeTyping() { var el = document.getElementById('typingBubble'); if (el) el.remove(); }
  function showCrisis() {
    // Reuses the prototype's crisis panel (country-aware resources + tap-to-call).
    var m = messagesEl();
    try { m.insertAdjacentHTML('beforeend', window.crisisHTML('mental')); }
    catch (e) { addBotBubble(t('error')); }
    m.scrollTop = m.scrollHeight;
  }

  /* ---------- conversation memory (in-page only for v1) -------------------- */
  var history = []; // [{role:'user'|'assistant', content}]

  function configured() {
    if (CONFIG.provider === 'proxy') return true; // proxy answers 501 if env is missing
    return !!(CONFIG.chatbase.apiKey && CONFIG.chatbase.chatbotId);
  }

  function callBackend(message) {
    var payload = { message: message, history: history.slice(-CONFIG.maxHistory), lang: lang() };
    if (CONFIG.provider === 'chatbase') {
      return fetch(CONFIG.chatbase.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + CONFIG.chatbase.apiKey
        },
        body: JSON.stringify({
          chatbotId: CONFIG.chatbase.chatbotId,
          stream: false,
          temperature: 0.7,
          messages: history.concat([{ role: 'user', content: message }]).map(function (h) {
            return { role: h.role, content: h.content };
          })
        })
      }).then(function (r) {
        if (!r.ok) throw new Error('chatbase ' + r.status);
        return r.json();
      }).then(function (j) {
        if (!j || !j.text) throw new Error('empty reply');
        return j.text;
      });
    }
    // default: serverless proxy (recommended — key stays server-side)
    return fetch(CONFIG.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (r.status === 501) throw new Error('not-configured');
      if (!r.ok) throw new Error('proxy ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || !j.reply) throw new Error('empty reply');
      return j.reply;
    });
  }

  function sendCompanionMessage(raw) {
    var text = String(raw || '').trim();
    if (!text) return;
    addUserBubble(text);
    if (looksLikeCrisis(text)) { showCrisis(); return; } // never send crisis text to the API
    if (!configured()) { addBotBubble(t('notConfigured')); return; }
    addTyping();
    callBackend(text).then(function (reply) {
      removeTyping();
      history.push({ role: 'user', content: text });
      history.push({ role: 'assistant', content: reply });
      addBotBubble(reply);
    }).catch(function (err) {
      removeTyping();
      addBotBubble(err && err.message === 'not-configured' ? t('notConfigured') : t('error'));
    });
  }

  /* ---------- wire up UI ---------------------------------------------------- */
  function injectStyles() {
    var css = '.chat-input{display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:var(--soft);border-top:1px solid var(--line)}'
      + '.chat-input input{flex:1;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:11px 16px;font:inherit;outline:none}'
      + '.chat-input input:focus{border-color:var(--accent)}'
      + '.chat-input button{width:44px;height:44px;flex:none;border:none;border-radius:50%;background:var(--accent);color:#fff;font-size:20px;line-height:1;cursor:pointer}'
      + '.chat-input button:active{transform:scale(.94)}'
      + '.bubble.typing p{opacity:.55;letter-spacing:2px}';
    var el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }

  function markLive() {
    var p = document.querySelector('#chat .chat-head p');
    if (p) p.textContent = lang() === 'fr'
      ? 'Compagnon IA · guidé par le programme d’Amandine'
      : 'AI companion · guided by Amandine’s program';
  }

  function init() {
    injectStyles();
    var form = q('#chatForm'), input = q('#chatText');
    if (!form || !input) return;
    input.placeholder = t('placeholder');
    input.addEventListener('focus', function () { input.placeholder = t('placeholder'); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value;
      input.value = '';
      sendCompanionMessage(v);
      input.focus();
    });
    markLive();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Exposed for debugging / future screens (session recs, check-in summaries).
  window.EmpoweredMamanCompanion = { send: sendCompanionMessage, config: CONFIG };
})();
