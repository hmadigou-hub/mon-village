// Netlify serverless function — Amandine's content overrides.
// Stores per-language text overrides in Netlify Blobs so her edits go live
// immediately, with no rebuild. PIN-gated via the EDIT_PIN env var.
//
// Endpoints:
//   GET  /.netlify/functions/content -> 200 {overrides:{...}} ({} when empty)
//   POST /.netlify/functions/content {pin} -> 200 {ok:true} | 401 {error:'bad pin'}
//   POST /.netlify/functions/content {pin, overrides} -> verifies, saves, 200 {ok:true}
//   EDIT_PIN unset -> 500 {error:'edit pin not configured'}

const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'content';
const STORE_KEY = 'overrides';
const MAX_BYTES = 200 * 1024;

// Netlify Blobs needs manual configuration for CLI-deployed sites:
// the Blobs context is not auto-injected into the function environment.
// siteID is public (visible in URLs); the token stays server-side in BLOBS_TOKEN.
const SITE_ID = '82c8f479-8cc0-46ba-b436-f349e5d1e5dd';

function getContentStore() {
  const token = process.env.BLOBS_TOKEN;
  if (!token) return null;
  return getStore({ name: STORE_NAME, siteID: SITE_ID, token });
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

function pinMatches(provided, expected) {
  const a = String(provided || '');
  const b = String(expected || '');
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Keep only {lang: {key: string | resource-object}} with sane sizes — never trust client shape.
// Keys matching need.<id>.res.<n> may hold a resource object {label, note, url}
// (all string values) so Amandine can attach real links to help cards.
var RES_KEY_RE = /^need\..*\.res\.\d+$/;
function sanitizeOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const lang of Object.keys(value)) {
    if (typeof lang !== 'string' || lang.length > 8) continue;
    const bucket = value[lang];
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) continue;
    out[lang] = {};
    for (const k of Object.keys(bucket)) {
      if (typeof k !== 'string' || k.length > 120) continue;
      const v = bucket[k];
      if (RES_KEY_RE.test(k)) {
        if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
        const o = {};
        for (const sk of Object.keys(v)) {
          if (typeof sk !== 'string' || sk.length > 40) continue;
          const sv = v[sk];
          if (typeof sv !== 'string') continue;
          o[sk] = sv.slice(0, 4000);
        }
        out[lang][k] = o;
        continue;
      }
      if (typeof v !== 'string') continue;
      out[lang][k] = v.slice(0, 4000);
    }
  }
  return out;
}

exports.handler = async (event) => {
  const store = getContentStore();

  if (event.httpMethod === 'GET') {
    if (!store) return json(200, { overrides: {} });
    try {
      const data = await store.get(STORE_KEY, { type: 'json' });
      return json(200, { overrides: data && typeof data === 'object' ? data : {} });
    } catch (err) {
      console.error('content get error', err && err.message);
      return json(200, { overrides: {} });
    }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const pinEnv = process.env.EDIT_PIN;
  if (!pinEnv) {
    return json(500, { error: 'edit pin not configured' });
  }

  let raw = event.body || '{}';
  if (event.isBase64Encoded) {
    try { raw = Buffer.from(raw, 'base64').toString('utf8'); } catch (_) { raw = '{}'; }
  }
  let body = {};
  try { body = JSON.parse(raw); } catch (_) { /* keep {} */ }

  if (!pinMatches(body.pin, pinEnv)) {
    return json(401, { error: 'bad pin' });
  }

  if (!('overrides' in body)) {
    return json(200, { ok: true });
  }

  if (!store) {
    return json(500, { error: 'storage not configured' });
  }

  const overrides = sanitizeOverrides(body.overrides);
  if (Buffer.byteLength(JSON.stringify(overrides), 'utf8') > MAX_BYTES) {
    return json(413, { error: 'overrides too large' });
  }

  try {
    await store.setJSON(STORE_KEY, overrides);
    return json(200, { ok: true });
  } catch (err) {
    console.error('content set error', err && err.message);
    return json(500, { error: 'save failed' });
  }
};
