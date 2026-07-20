/**
 * Gmail → Supabase historical_qa
 *
 * Fetches threads where DSA (sales@dsaseatfactory.com) sent a reply,
 * extracts customer→rep Q&A pairs, embeds with Voyage AI, inserts into historical_qa.
 *
 * Source tagging:
 *   source='ebay'  — From header contains an eBay domain, or subject has eBay item pattern
 *   source='gmail' — everything else (direct customer email)
 *
 * First run (no GOOGLE_REFRESH_TOKEN in .env):
 *   1. Opens browser for Google OAuth consent
 *   2. Prints the refresh token — paste it into .env as GOOGLE_REFRESH_TOKEN
 *   3. Re-run to start the full import
 *
 * Env vars required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   GOOGLE_REFRESH_TOKEN  ← filled in after first run
 */

import { google }    from 'googleapis';
import http          from 'node:http';
import { createClient } from '@supabase/supabase-js';

// --- Config ---
const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_KEY        = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_KEY          = process.env.VOYAGE_API_KEY;
const GOOGLE_CLIENT_ID    = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN; // empty on first run
const DSA_EMAIL           = 'sales@dsaseatfactory.com';
const OAUTH_PORT          = 4747;
const REDIRECT_URI        = `http://localhost:${OAUTH_PORT}/callback`;
const SCOPES              = ['https://www.googleapis.com/auth/gmail.readonly'];

const required = { SUPABASE_URL, SUPABASE_KEY, VOYAGE_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET };
const missing  = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) { console.error('Missing env vars:', missing.join(', ')); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const delay    = ms => new Promise(r => setTimeout(r, ms));

// ─── Google OAuth ────────────────────────────────────────────────────────────

function makeOAuth2Client() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);
}

async function getRefreshTokenViaOAuth() {
  const oauth2Client = makeOAuth2Client();
  const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url  = new URL(req.url, `http://localhost:${OAUTH_PORT}`);
      const code = url.searchParams.get('code');
      if (!code) { res.end('No code — try again.'); return; }
      res.end('<h2>Authorised ✓ — you can close this tab and return to the terminal.</h2>');
      server.close();
      try {
        const { tokens } = await oauth2Client.getToken(code);
        resolve(tokens.refresh_token);
      } catch (e) { reject(e); }
    });
    server.listen(OAUTH_PORT, () => {
      console.log('\nOpening browser for Google sign-in…');
      console.log('If it doesn\'t open automatically, paste this URL into your browser:\n');
      console.log(authUrl + '\n');
      import('child_process').then(({ exec }) => exec(`open "${authUrl}"`)).catch(() => {});
    });
  });
}

async function getAuthClient() {
  const oauth2Client = makeOAuth2Client();
  if (GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
    return oauth2Client;
  }
  console.log('No GOOGLE_REFRESH_TOKEN found — starting OAuth consent flow…');
  const refreshToken = await getRefreshTokenViaOAuth();
  console.log('\n✓ Authorised. Add this line to your import-scripts/.env file:\n');
  console.log(`GOOGLE_REFRESH_TOKEN=${refreshToken}\n`);
  console.log('Then re-run:  npm run import:gmail\n');
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

// ─── Gmail message parsing ───────────────────────────────────────────────────

function getHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function decodeBase64url(data) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractPlainText(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeBase64url(payload.body.data);
  if (payload.parts) {
    // Prefer text/plain
    for (const p of payload.parts) {
      if (p.mimeType === 'text/plain' && p.body?.data) return decodeBase64url(p.body.data);
    }
    // Recurse into nested multipart
    for (const p of payload.parts) {
      const t = extractPlainText(p);
      if (t) return t;
    }
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodeBase64url(payload.body.data)
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  }
  return '';
}

// Strip quoted chains, eBay boilerplate, and email signatures
function cleanEmailText(text) {
  if (!text) return '';
  return text
    .replace(/On .{5,120}?\n?wrote:\s*/gi, '')       // "On [date] X wrote:"
    .replace(/^>+.*/gm, '')                           // "> quoted lines"
    .replace(/[-_]{3,}\s*(Original|Forwarded)[\s\S]*/gi, '')  // --- Original Message ---
    .replace(/eBay sent this message on behalf[\s\S]*/gi, '')
    .replace(/To protect your personal information[\s\S]*/gi, '')
    .replace(/Reply to this email or go to[\s\S]*/gi, '')
    .replace(/This message was sent while the listing[\s\S]*/gi, '')
    .replace(/Respond to this message[\s\S]*/gi, '')
    .replace(/\[cid:[^\]]+\]/g, '')                   // inline image placeholders
    .replace(/\n--\s*\n[\s\S]{0,600}$/, '')           // email signature after --
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isEbayFrom(from) {
  return /@ebay\.(co\.uk|de|fr|it|es|com)|@members\.ebay|messages@ebay|noreply@ebay/i.test(from);
}

function isEbayThread(from, subject) {
  return isEbayFrom(from) || /#\d{10,}/i.test(subject) || /ebay\.(co\.uk|de|fr|it|es|com)/i.test(subject);
}

function isDsa(from) {
  return from.toLowerCase().includes(DSA_EMAIL.toLowerCase());
}

// ─── Extract Q&A pairs from a Gmail thread ──────────────────────────────────

function extractPairs(messages) {
  const parsed = messages.map(msg => {
    const headers = msg.payload?.headers || [];
    const from    = getHeader(headers, 'from');
    const subject = getHeader(headers, 'subject');
    const dateStr = getHeader(headers, 'date');
    return {
      msgId:   msg.id,
      threadId: msg.threadId,
      from,
      subject,
      date:    new Date(dateStr || 0),
      text:    cleanEmailText(extractPlainText(msg.payload)),
      isDsa:   isDsa(from),
      isEbay:  isEbayThread(from, subject),
    };
  }).sort((a, b) => a.date - b.date);

  const pairs = [];
  for (let i = 0; i < parsed.length; i++) {
    const msg = parsed[i];
    if (msg.isDsa) continue;           // skip DSA's own messages as "Q" source
    if (!msg.text || msg.text.length < 15) continue;

    // Find the next DSA message after this customer message
    const reply = parsed.slice(i + 1).find(m => m.isDsa && m.text && m.text.length >= 10);
    if (!reply) continue;

    pairs.push({
      customerText:    msg.text,
      repText:         reply.text,
      source:          msg.isEbay ? 'ebay' : 'gmail',
      sourceThreadId:  msg.msgId,          // customer Gmail message ID — unique dedup key
      threadId:        msg.threadId,
      customerHandle:  msg.from,
      subject:         msg.subject,
      occurredAt:      msg.date.toISOString(),
    });
  }
  return pairs;
}

// ─── Language detection ──────────────────────────────────────────────────────

function detectLanguage(text) {
  const s = text.toLowerCase().slice(0, 500);
  const scores = { fr: 0, de: 0, it: 0, es: 0, en: 0 };
  if (/\b(bonjour|merci|cordialement|housse|voiture|siège|svp)\b/.test(s)) scores.fr += 3;
  if (/\b(je|vous|nous|est|avec|pour|dans)\b/.test(s)) scores.fr += 1;
  if (/\b(hallo|danke|fahrzeug|sitz|bezüge|bitte|grüße|guten)\b/.test(s)) scores.de += 3;
  if (/\b(ich|sie|wir|ist|mit|für|und|der|die|das)\b/.test(s)) scores.de += 1;
  if (/\b(buongiorno|grazie|cordiali|sedile|coprisedile|saluti)\b/.test(s)) scores.it += 3;
  if (/\b(sono|siete|abbiamo|con|per|nel|della)\b/.test(s)) scores.it += 1;
  if (/\b(hola|gracias|saludos|funda|asiento|coche|por favor)\b/.test(s)) scores.es += 3;
  if (/\b(soy|estás|tenemos|con|para|en)\b/.test(s)) scores.es += 1;
  if (/\b(hello|thanks|regards|cover|seat|please|vehicle)\b/.test(s)) scores.en += 3;
  if (/\b(i|you|we|is|with|for|the|and)\b/.test(s)) scores.en += 1;
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : 'en';
}

// ─── Voyage AI embedding ─────────────────────────────────────────────────────

async function embed(text) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${VOYAGE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'voyage-multilingual-2', input: [text.slice(0, 16000)] }),
    });
    if (res.status === 429) {
      const wait = 22000 * (attempt + 1); // 22s, 44s, 66s…
      process.stdout.write(`\n  [Voyage 429] rate limited — waiting ${wait / 1000}s…`);
      await delay(wait);
      continue;
    }
    if (!res.ok) throw new Error(`Voyage error ${res.status}: ${await res.text()}`);
    return (await res.json()).data[0].embedding;
  }
  throw new Error('Voyage: exceeded retry limit on 429');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Authenticating with Google…');
  const auth  = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  // Collect all thread IDs where DSA sent a reply
  console.log('Listing threads (label: SENT)…');
  const allThreadIds = [];
  let pageToken;
  let page = 0;
  do {
    page++;
    process.stdout.write(`\r  Page ${page} | ${allThreadIds.length} threads   `);
    const resp = await gmail.users.threads.list({
      userId:    'me',
      labelIds:  ['SENT'],
      maxResults: 500,
      pageToken,
    });
    (resp.data.threads || []).forEach(t => allThreadIds.push(t.id));
    pageToken = resp.data.nextPageToken;
    if (pageToken) await delay(100);
  } while (pageToken);

  console.log(`\n  ${allThreadIds.length} threads to process\n`);

  let inserted = 0, skipped = 0, noReply = 0, errors = 0;

  for (let i = 0; i < allThreadIds.length; i++) {
    const threadId = allThreadIds[i];
    process.stdout.write(
      `\r  Thread ${i + 1}/${allThreadIds.length} | inserted: ${inserted}  skipped: ${skipped}  no-reply: ${noReply}  errors: ${errors}   `
    );

    try {
      const threadResp = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
      const messages   = threadResp.data.messages || [];
      const pairs      = extractPairs(messages);

      if (pairs.length === 0) { noReply++; continue; }

      for (const pair of pairs) {
        // Dedup on customer Gmail message ID (sourceThreadId)
        const { data: existing } = await supabase
          .from('historical_qa')
          .select('id')
          .eq('source', pair.source)
          .eq('source_thread_id', pair.sourceThreadId)
          .maybeSingle();
        if (existing) { skipped++; continue; }

        const language  = detectLanguage(pair.customerText);
        const embedding = await embed(`${pair.customerText}\n\n${pair.repText}`);

        const { error } = await supabase.from('historical_qa').insert({
          source:           pair.source,
          source_thread_id: pair.sourceThreadId,
          customer_handle:  pair.customerHandle,
          language,
          customer_text:    pair.customerText,
          rep_text:         pair.repText,
          occurred_at:      pair.occurredAt,
          embedding,
          metadata: { subject: pair.subject, gmail_thread_id: pair.threadId },
        });

        if (error) { console.error(`\n  Insert error: ${error.message}`); errors++; }
        else inserted++;
      }
    } catch (e) {
      // 429 rate limit — back off and retry once
      if (e.code === 429 || e.status === 429) {
        await delay(5000);
        i--; // retry this thread
        continue;
      }
      console.error(`\n  Error thread ${threadId}: ${e.message}`);
      errors++;
    }

    await delay(120); // ~8 threads/sec — well under Gmail quota
  }

  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`DONE: ${inserted} Q&A pairs inserted`);
  console.log(`      ${skipped} skipped (already imported), ${noReply} no DSA reply found, ${errors} errors`);
  console.log(`Verify: SELECT source, language, COUNT(*) FROM historical_qa GROUP BY 1, 2;`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
