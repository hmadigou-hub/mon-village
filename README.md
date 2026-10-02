# Mon Village — App (v1 scaffold)

*Product name decided 2026-10-01: "Mon Village" by Empowered Maman (renamed
from "Concierge"). "Village" reads identically in French and English, and
"it takes a village" is the core postpartum truth.*

The prototype's exact interface, extracted into a real, deployable web project.
Same screens, flows, French/English copy and styling — plus the wiring a real
app needs: installability (PWA), a companion-chat backend hookup, and a
serverless proxy that keeps API keys off the browser.

## What's in here

| File | What it is |
|---|---|
| `index.html` | The prototype, untouched except: PWA tags, a free-text chat input, and the adapter script tag |
| `js/chat-adapter.js` | Connects free-text chat to the companion API; crisis tripwire reuses the prototype's own crisis panel; registers the service worker |
| `netlify/functions/chat.js` | Serverless proxy → Chatbase (keeps the API key server-side); carries the system prompt (persona + safety guardrails, FR/EN) |
| `netlify.toml` | Netlify build config |
| `manifest.webmanifest` + `sw.js` + `icons/` | PWA: installable, offline shell |

## Run it locally

```bash
cd app
python3 -m http.server 8080
# open http://localhost:8080
```

(Use `localhost`, not `file://` — service workers require http(s).)
Everything works except the AI chat, which shows a "not connected yet" message
until you configure the backend below.

## Deploy it (Netlify, free)

1. Push this `app/` folder to a Git repo (or drag-drop the folder in Netlify).
2. Netlify auto-detects `netlify.toml`. Your URL is live in ~1 minute.
3. Add env vars in Netlify → Site settings → Environment variables:
   - `CHATBASE_API_KEY` — from chatbase.co dashboard
   - `CHATBASE_BOT_ID` — the chatbot trained on Amandine's transcripts

## Connect the companion brain

1. Create a Chatbase chatbot; train it on the exported Kajabi transcripts
   (+ voice guide, FAQs, safety protocol doc).
2. Set the chatbot's own base prompt to match `netlify/functions/chat.js`
   (or rely on the proxy's system prompt — don't duplicate conflicting rules).
3. Test in Chatbase's playground in **French and English**, including the
   crisis phrases — the companion must hand over to crisis resources every time.
4. Paste the key + bot id into Netlify env vars. The chat input in the app
   now answers from Amandine's content. Quick-reply chips keep scripted answers.

## What's deliberately not built yet

- **Accounts + saved data** (check-in history, journal, EPDS scores): needs a
  backend like Supabase/Firebase + login. The UI is ready; storage isn't.
- **Exercise library content**: session names/cues are placeholders from the
  prototype — Amandine's real sessions go here.
- **System prompt tuning**: `netlify/functions/chat.js` has a starter prompt.
  Amandine should review and rewrite it in her voice before any member sees it.
- **Human review loop**: plan a weekly read of flagged conversations at launch.

## Safety notes (non-negotiable)

- The companion is non-diagnostic. The system prompt, the client tripwire
  (`CRISIS_WORDS` in `chat-adapter.js`), and the prototype's crisis panel are
  three independent layers — keep all three.
- Crisis resources by country already live in the prototype (`resources` map:
  US 988, FR 3114, CA 988, UK 116 123). Verify numbers before launch.
- Never put the Chatbase API key in `chat-adapter.js` for production —
  use the proxy. Keys in client JS are public.
