/**
 * WhatsApp Business Export → Supabase historical_qa
 *
 * Usage:
 *   1. Place WhatsApp export folders in: ./whatsapp_exports/
 *      Each folder contains a _chat.txt (and optionally photos).
 *      Folder name doesn't matter — script reads _chat.txt in each.
 *   2. Set env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY
 *   3. Run: node 02_parse_whatsapp.js
 *
 * What it does:
 *   - Parses each _chat.txt into messages
 *   - Filters auto-replies and encryption notices
 *   - Pairs consecutive customer messages with consecutive rep replies
 *   - Detects language (simple heuristic; for production use franc or cld)
 *   - Generates embeddings via Voyage AI voyage-multilingual-2 (1024 dims)
 *   - Inserts into Supabase historical_qa table
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { detectLanguage } from './lib/lang.js';
import { embed } from './lib/embed.js';

// --- Config ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_KEY = process.env.VOYAGE_API_KEY;
const EXPORTS_DIR = process.env.EXPORTS_DIR || './whatsapp_exports';

if (!SUPABASE_URL || !SUPABASE_KEY || !VOYAGE_KEY) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Parsing ---
const LINE_RE = /^\u200E?\[(\d{4}-\d{2}-\d{2}), (\d{2}:\d{2}:\d{2})\] (.+?): ?(.*)$/;

const AUTO_REPLY_MARKERS = [
  'Thank you for your message',
  'Vielen Dank für Ihre Nachricht',
  'Merci pour votre message',
  'Gracias por tu mensaje',
  'Grazie per il tuo messaggio',
  'Tack för ditt meddelande',
  'Thank you for contacting DSA Seat Factory',
  'Messages and calls are end-to-end encrypted',
];

const isAutoReply = (text) => AUTO_REPLY_MARKERS.some((m) => text.includes(m));

const cleanText = (text) =>
  text
    .replace(/\u200E?<attached: [^>]+>/g, '[image]')
    .replace(/\u200E/g, '')
    .replace(/\r/g, '')
    .trim();

function parseChat(raw) {
  const lines = raw.split('\n');
  const messages = [];
  let current = null;

  for (const line of lines) {
    const m = line.match(LINE_RE);
    if (m) {
      if (current) messages.push(current);
      const [, date, time, sender, text] = m;
      current = {
        date,
        time,
        sender: sender.trim(),
        text,
        isCustomer: sender.trim().startsWith('~'),
      };
    } else if (current && line.trim()) {
      current.text += '\n' + line;
    }
  }
  if (current) messages.push(current);

  return messages
    .map((msg) => ({ ...msg, text: cleanText(msg.text) }))
    .filter((msg) => msg.text && !isAutoReply(msg.text));
}

function pairQA(messages) {
  const pairs = [];
  let i = 0;
  while (i < messages.length) {
    if (messages[i].isCustomer) {
      const customerMsgs = [];
      while (i < messages.length && messages[i].isCustomer) {
        customerMsgs.push(messages[i]);
        i++;
      }
      const repMsgs = [];
      while (i < messages.length && !messages[i].isCustomer) {
        repMsgs.push(messages[i]);
        i++;
      }
      if (customerMsgs.length && repMsgs.length) {
        const lastRepText = repMsgs[repMsgs.length - 1].text;
        const sigMatch = lastRepText.match(/\n([A-Z][a-z]+)\nDSA Seat Factory$/);
        pairs.push({
          customer_text: customerMsgs.map((m) => m.text).join('\n'),
          rep_text: repMsgs.map((m) => m.text).join('\n'),
          rep_signature: sigMatch ? sigMatch[1] : null,
          occurred_at: new Date(`${customerMsgs[0].date}T${customerMsgs[0].time}`).toISOString(),
          customer_handle: customerMsgs[0].sender.replace(/^~/, '').trim(),
        });
      }
    } else {
      i++;
    }
  }
  return pairs;
}


// --- Main ---
async function main() {
  const exportFolders = await fs.readdir(EXPORTS_DIR);
  let totalPairs = 0;
  let totalInserted = 0;

  for (const folder of exportFolders) {
    const chatPath = path.join(EXPORTS_DIR, folder, '_chat.txt');
    try {
      await fs.access(chatPath);
    } catch {
      continue; // not a WhatsApp export folder
    }

    console.log(`\nProcessing: ${folder}`);
    const raw = await fs.readFile(chatPath, 'utf-8');
    const messages = parseChat(raw);
    const pairs = pairQA(messages);
    totalPairs += pairs.length;

    console.log(`  ${messages.length} messages → ${pairs.length} Q&A pairs`);

    for (const pair of pairs) {
      const language = detectLanguage(pair.customer_text);
      const embedText = `${pair.customer_text}\n\n${pair.rep_text}`;

      try {
        const embedding = await embed(embedText);
        const { error } = await supabase.from('historical_qa').insert({
          source: 'whatsapp',
          source_thread_id: folder,
          customer_handle: pair.customer_handle,
          language,
          customer_text: pair.customer_text,
          rep_text: pair.rep_text,
          rep_signature: pair.rep_signature,
          occurred_at: pair.occurred_at,
          embedding,
          metadata: { source_folder: folder },
        });
        if (error) {
          console.error(`  Insert error: ${error.message}`);
        } else {
          totalInserted++;
        }
      } catch (e) {
        console.error(`  Embedding error: ${e.message}`);
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`DONE: ${totalPairs} pairs found, ${totalInserted} inserted into Supabase`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
