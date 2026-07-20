# DSA Customer Service Database — Claude Code Handoff Brief

**Paste this entire document into Claude Code as your first message** when you start the build session. It contains everything Claude Code needs to pick up where we left off.

---

## Who you are working for

I'm Pejman, owner of United Seat Factory (USF), a Houston-based company selling OEM-replacement auto seat covers across multiple brands. I'm non-technical and rely on natural language to manage software builds. I do **not** want terminal-heavy workflows — but I'm using Claude Code now because we're building fast and need the build/iterate loop on my machine. I'll answer questions as they come up. When you produce code, I prefer complete files I can run, not partial snippets.

## What we are building

A **Customer Service AI draft system** for our DSA Seat Factory brand (Europe). When a customer sends us a message (eBay, Gmail, or WhatsApp), the system:

1. Detects the language
2. Translates the message to English (exact, literal — not polished)
3. Finds 5 similar past Q&A pairs in our knowledge base (via vector similarity)
4. Generates a draft reply in the customer's original language
5. Translates the draft back to English (exact translation)
6. Shows all four blocks (original Q + EN Q + draft reply + EN draft) to a CS rep
7. Rep clicks Copy / Edit & Copy / Reject

**Reps are English-only**, so the parallel English translation is what they use to verify before sending. The draft they actually send is the original-language version.

**Pilot scope: DSA brand only.** If it works, we expand to USASC, USAN, etc.

## Stack (already in place)

- **Frontend:** Next.js (React) on Vercel
- **Backend:** Supabase (Postgres + Edge Functions + pgvector)
- **Repo:** `seatcover-oms` on GitHub — `https://github.com/Pejmana1978/seatcover-oms` (local folder is renamed to `dsa-oms` but it's the same repo)
- **Local folder:** `~/Dropbox/0 Pejman/Claude Projects/seat-cover/dsa-oms`
- **Live URL:** `https://seatcover-oms.vercel.app`
- **Supabase project ref:** `nvqhgkqjlvymnwcsfbee`
- **eBay App ID (DSA):** `DSAAutoS-SeatCove-PRD-7f61be8bd-0f316e5d`
- **eBay RuName (DSA):** `DSA_Auto_Seat_F-DSAAutoS-SeatCo-jaddgi`
- **Gmail (DSA):** `sales@dsaseatfactory.com` on Google Workspace

This project **extends the existing OMS repo** — do not start a new app. Add new tables, new edge functions, and a new `/customer-service` route to the existing Next.js app.

## What's already done (deliverables from the chat session)

Three files are in a folder ready to be pulled in:

1. **`01_supabase_migration.sql`** — SQL migration creating:
   - `historical_qa` table (knowledge base, with `embedding VECTOR(1536)`)
   - `incoming_messages` table (new customer messages)
   - `drafts` table (AI-generated replies)
   - `feedback` table (rep actions on drafts)
   - `match_historical_qa()` function (vector similarity search)
   - pgvector extension enabled

2. **`02_parse_whatsapp.js`** — Node ESM script that parses WhatsApp Business `.txt` exports into Q&A pairs, embeds them with OpenAI `text-embedding-3-small`, and inserts into `historical_qa`. **Already tested** — works on real DSA WhatsApp exports.

3. **`package.json`** — deps: `@supabase/supabase-js`, `openai`.

These files are at the bottom of this brief (you can write them to disk yourself).

## What you (Claude Code) need to build, in order

### Step 1 — Run the SQL migration

Open Supabase dashboard → SQL Editor → paste `01_supabase_migration.sql` → run. Verify with:
```sql
SELECT COUNT(*) FROM historical_qa;
SELECT COUNT(*) FROM incoming_messages;
```

### Step 2 — Set up and run WhatsApp import

1. Create folder `import-scripts/` at the repo root (separate from the Next.js app — these are one-time scripts).
2. Put the WhatsApp `.txt` export folders inside `import-scripts/whatsapp_exports/`. The user (Pejman) will provide these — ask him to drop them in or send them.
3. Add env vars to `.env.local` (or wherever the OMS already keeps secrets):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (service role, NOT anon — needed to insert)
   - `OPENAI_API_KEY` (Pejman needs to provide this)
4. `cd import-scripts && npm install && npm run import:whatsapp`
5. Verify: `SELECT source, language, COUNT(*) FROM historical_qa GROUP BY 1, 2;`

### Step 3 — Build eBay extraction script

Create `import-scripts/03_parse_ebay.js` that:

- Uses the existing eBay OAuth credentials already set up in the OMS repo (look for the edge function `ebay-sync` — it has the auth flow).
- Calls eBay Trading API `GetMyMessages` for the DSA account. Auth uses the user's eBay auth token already stored.
- Paginates through ALL historical messages (eBay returns 200 per call; loop until empty).
- For each message thread, pairs customer questions with rep replies. eBay's API gives sender info (`Sender` field) — if sender is the DSA account, it's a rep; otherwise it's the customer.
- Strips signatures, "On [date] X wrote:" quoted blocks, and HTML.
- Detects language (same logic as WhatsApp script — extract `detectLanguage` to a shared `lib/lang.js`).
- Embeds with OpenAI `text-embedding-3-small`.
- Inserts into `historical_qa` with `source = 'ebay'`.
- Deduplicates: skip if `(source='ebay', source_thread_id=X, customer_text=Y)` already exists.

eBay API reference: `GetMyMessages` returns messages with `MessageID`, `Sender`, `RecipientUserID`, `Subject`, `Text`, `ReceiveDate`. Use `https://api.ebay.com/ws/api.dll` endpoint. The auth token is XAuth header style for the legacy Trading API.

**If you can't find the existing eBay auth in the repo, ask Pejman.** He has the credentials.

### Step 4 — Build Gmail extraction script

Create `import-scripts/04_parse_gmail.js` that:

- Uses Google OAuth for `sales@dsaseatfactory.com` (Google Workspace). Use the `googleapis` npm package.
- First run: triggers OAuth consent flow (opens browser, Pejman authorizes). Stores refresh token in `.env.local` for future runs.
- Pulls all messages in the inbox (not just primary — include `category:promotions`, etc.? Probably skip promotions and only include threads where the sales account sent a reply, i.e., real customer correspondence).
- For each thread, pairs customer messages with sales account replies. Reuses existing CS rep replies as the "answer" side.
- Strips email signatures, quoted "On [date]" reply chains, HTML, image attachments.
- Detects language, embeds, inserts into `historical_qa` with `source = 'gmail'`.

Gmail's API: `users.threads.list` then `users.threads.get` for each. Filter to messages where labels include `INBOX` or `SENT`.

**Estimated volume:** ask Pejman, but probably thousands of threads. May take 30–60 min to run.

### Step 5 — Build the draft generation Edge Function

Create `supabase/functions/generate-draft/index.ts` that:

- Trigger: HTTP POST with `{ incoming_message_id: number }`.
- Loads the incoming message from DB.
- Detects language of `body` (use same `detectLanguage` logic).
- Embeds the message body with OpenAI.
- Calls `match_historical_qa(query_embedding, 5)` to get the 5 most similar past Q&A pairs.
- Constructs a prompt for Claude Sonnet 4.5 (model: `claude-sonnet-4-5-20250929`) with:
  - System: "You are drafting a customer service reply for DSA Seat Factory, a US manufacturer of replacement auto seat covers selling in Europe. Voice: warm, professional, helpful, US-made-but-Europe-aware. Past Q&A pairs from our team are provided for style and answer reference."
  - The 5 reference pairs (customer_text + rep_text)
  - The incoming message
  - Instruction: "Return a JSON object with EXACTLY these 4 keys:
    - `customer_lang`: ISO 639-1 code
    - `customer_text_en`: exact LITERAL English translation of the customer message (preserve tone, urgency, hedging; awkward English is OK, polished English is NOT). If already English, return verbatim.
    - `draft_text`: your reply in the customer's original language
    - `draft_text_en`: exact LITERAL English translation of the draft (same rules)"
- Parses the JSON response.
- Inserts a row into `drafts` with the draft text + English translations + reference QA IDs.
- Updates `incoming_messages.status` to `'drafted'`.
- Returns the draft to the caller.

Use `@anthropic-ai/sdk`. Anthropic API key from env: `ANTHROPIC_API_KEY`.

### Step 6 — Build polling for new messages

Two scheduled edge functions, run every 2 minutes via Supabase cron:

- `supabase/functions/poll-ebay/index.ts` — calls eBay `GetMyMessages` with `StartTime` = last poll time, inserts new messages into `incoming_messages`, then for each new row calls `generate-draft`.
- `supabase/functions/poll-gmail/index.ts` — calls Gmail `users.history.list` with `startHistoryId`, same pattern.

Store last poll time in a `system_state` key-value table (create it: `CREATE TABLE system_state (key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT NOW())`).

### Step 7 — Build the rep UI

Add a new route to the existing Next.js app at `/customer-service`:

- **Inbox view:** List of `incoming_messages` where `status = 'drafted'`, sorted by `received_at DESC`. Each row shows source icon (eBay/Gmail/WA), customer handle, subject (if any), first 80 chars of message, language flag.
- **Click a row** → opens the 4-block view:
  1. **Original customer message** (the language they wrote in) — top
  2. **English translation** of customer message — only show if language ≠ 'en'
  3. **Draft reply** in customer's language — what gets copied
  4. **English translation** of draft — only show if language ≠ 'en'
  Plus: a sidebar showing the 3–5 reference past Q&A pairs that informed the draft (so reps can see "this draft is based on these past answers").
- **Buttons:** [Copy] [Edit & Copy] [Reject] [Flag for review]
  - Copy: copies the customer-language draft to clipboard, sets `status = 'sent'`, logs to `feedback`.
  - Edit & Copy: opens textarea with draft pre-filled, on save copies edited version, logs to `feedback` with `action = 'sent_edited'` and `final_text = edited`.
  - Reject: `status = 'skipped'`, logs to `feedback`.
  - Flag: `status = 'flagged'`, prompts for short note.

Reuse existing auth from the OMS (role-based). All CS reps get access; only admin sees the feedback dashboard (deferred).

### Step 8 — Test live

- Pick 10 real recent DSA messages (eBay or Gmail) that have NOT been replied to yet.
- Run them through the system manually (call `generate-draft` with their IDs).
- Pejman reviews drafts: are they good enough?
- Fix prompt issues, add reference pairs if needed.

### What we explicitly cut (for speed)

- WhatsApp live ingestion (defer until WhatsApp Business API migration via 360dialog)
- Feedback dashboard for admins
- Multi-rep handoff workflows
- Automated send (always copy-paste, never auto-send)
- USASC/USAN/other brands (DSA pilot first)

## Working style preferences

- **Ship working code, not perfect code.** This is a 3–4 day push, not a 6-month project.
- **Ask before assuming.** If a credential or detail is missing, ask Pejman, don't guess.
- **Verify each step before moving on.** Run the SQL, confirm tables exist. Run the WhatsApp script, confirm rows inserted. Then move to eBay.
- **No long postambles.** Pejman prefers direct, concise communication.
- **Complete files, not snippets.** When you create or modify a file, write the whole thing.

## Open items for Pejman to confirm at session start

1. `OPENAI_API_KEY` — Pejman needs to provide (for embeddings). Get one at platform.openai.com → API keys. Set in `.env.local`.
2. `ANTHROPIC_API_KEY` — Pejman needs to provide (for draft generation). Get one at console.anthropic.com → API keys.
3. `SUPABASE_SERVICE_ROLE_KEY` — Pejman has this in Supabase dashboard → Project Settings → API → service_role key. (NOT the anon key.)
4. WhatsApp exports — Pejman has some; he'll drop them into `import-scripts/whatsapp_exports/`.
5. eBay auth — confirm whether the existing `ebay-sync` edge function in the repo has working auth we can reuse, or whether we need to redo it.

---

## Appendix A — `01_supabase_migration.sql`

(See the file Pejman will provide alongside this brief, or recreate from the schema described above.)

## Appendix B — `02_parse_whatsapp.js`

(See the file Pejman will provide alongside this brief.)

## Appendix C — `package.json`

```json
{
  "name": "cs-database-import",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "openai": "^4.65.0"
  }
}
```

---

**Start by:**
1. Confirming you have access to the `dsa-oms` folder at `~/Dropbox/0 Pejman/Claude Projects/seat-cover/dsa-oms`
2. Asking Pejman for the three API keys listed in "Open items"
3. Running the SQL migration in Supabase
4. Then ask Pejman where to put the WhatsApp export folders and proceed to Step 2
