/**
 * eBay → Supabase historical_qa
 *
 * Strategy (GetMyMessages cannot enumerate without IDs, so we use orders):
 *   1. GetOrders (Trading API, 90-day windows) → collect all (ItemID, BuyerUserID) pairs
 *   2. GetMemberMessages for each pair → full buyer↔seller thread (both sides)
 *   3. Pair Q&A turns, embed with Voyage AI voyage-multilingual-2, insert into historical_qa
 *
 * Env vars needed (all in .env):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EBAY_AUTH_TOKEN, VOYAGE_API_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';

// --- Config ---
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EBAY_AUTH_TOKEN = process.env.EBAY_AUTH_TOKEN;
const VOYAGE_KEY    = process.env.VOYAGE_API_KEY;

const missing = Object.entries({ SUPABASE_URL, SUPABASE_KEY, EBAY_AUTH_TOKEN, VOYAGE_KEY })
  .filter(([, v]) => !v).map(([k]) => k);
if (missing.length) { console.error('Missing env vars:', missing.join(', ')); process.exit(1); }

const supabase   = createClient(SUPABASE_URL, SUPABASE_KEY);
const xmlParser  = new XMLParser({ ignoreAttributes: false, parseTagValue: true });
const TRADING_API = 'https://api.ebay.com/ws/api.dll';
const delay = ms => new Promise(r => setTimeout(r, ms));

// --- Trading API call (Auth'n'Auth token in XML body) ---
async function tradingCall(callName, xmlBody) {
  const withAuth = xmlBody.replace(
    /(<\w+Request[^>]*>)/,
    `$1<RequesterCredentials><eBayAuthToken>${EBAY_AUTH_TOKEN}</eBayAuthToken></RequesterCredentials>`
  );
  const res = await fetch(TRADING_API, {
    method: 'POST',
    headers: {
      'X-EBAY-API-SITEID': '3',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-CALL-NAME': callName,
      'Content-Type': 'text/xml',
    },
    body: `<?xml version="1.0" encoding="utf-8"?>${withAuth}`,
  });
  return xmlParser.parse(await res.text());
}

// --- Step 1: collect unique (itemId, buyerId) pairs from all orders ---
async function collectOrderPairs() {
  const pairs = new Map(); // "itemId|buyerId" → { itemId, buyerId }
  const windowMs = 90 * 24 * 60 * 60 * 1000;
  // GetOrders (Trading API) only returns orders within the last 90 days
  const ninetyDaysAgo = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000);
  let windowStart = ninetyDaysAgo;
  const end = new Date();
  let totalOrders = 0;

  while (windowStart < end) {
    const windowEnd = new Date(Math.min(windowStart.getTime() + windowMs, end.getTime()));
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      process.stdout.write(
        `\r  GetOrders ${windowStart.toISOString().slice(0,10)}→${windowEnd.toISOString().slice(0,10)} ` +
        `p${page}/${totalPages} | ${pairs.size} pairs   `
      );

      const result = await tradingCall('GetOrders', `
        <GetOrdersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
          <DetailLevel>ReturnAll</DetailLevel>
          <CreateTimeFrom>${windowStart.toISOString()}</CreateTimeFrom>
          <CreateTimeTo>${windowEnd.toISOString()}</CreateTimeTo>
          <OrderStatus>All</OrderStatus>
          <Pagination>
            <EntriesPerPage>100</EntriesPerPage>
            <PageNumber>${page}</PageNumber>
          </Pagination>
        </GetOrdersRequest>
      `);

      const resp = result?.GetOrdersResponse;
      if (resp?.Ack === 'Failure') {
        console.error(`\n  GetOrders error: ${JSON.stringify(resp?.Errors)}`);
        break;
      }

      const raw = resp?.OrderArray?.Order;
      if (raw) {
        const orders = Array.isArray(raw) ? raw : [raw];
        for (const order of orders) {
          totalOrders++;
          const txRaw = order.TransactionArray?.Transaction;
          if (!txRaw) continue;
          const txs = Array.isArray(txRaw) ? txRaw : [txRaw];
          for (const tx of txs) {
            const itemId  = String(tx.Item?.ItemID || '');
            const buyerId = String(tx.Buyer?.UserID || order.BuyerUserID || '');
            if (itemId && buyerId) {
              pairs.set(`${itemId}|${buyerId}`, { itemId, buyerId });
            }
          }
        }
      }

      totalPages = parseInt(resp?.PaginationResult?.TotalNumberOfPages ?? '1', 10);
      page++;
      if (page <= totalPages) await delay(220);
    }

    windowStart = new Date(windowEnd.getTime() + 1);
    await delay(220);
  }

  console.log(`\n  ${totalOrders} orders → ${pairs.size} unique (item, buyer) pairs`);
  return [...pairs.values()];
}

// --- Step 2: fetch full buyer↔seller thread for one (itemId, buyerId) ---
async function fetchMemberMessages(itemId, buyerId) {
  const result = await tradingCall('GetMemberMessages', `
    <GetMemberMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <ItemID>${itemId}</ItemID>
      <MailMessageType>All</MailMessageType>
      <SenderID>${buyerId}</SenderID>
      <StartCreationTime>2020-01-01T00:00:00.000Z</StartCreationTime>
      <EndCreationTime>${new Date().toISOString()}</EndCreationTime>
    </GetMemberMessagesRequest>
  `);

  const resp = result?.GetMemberMessagesResponse;
  if (!resp || resp?.Ack === 'Failure') return [];
  const raw = resp?.MemberMessage?.MemberMessageExchange;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

// --- Language detection ---
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

// --- Strip quoted reply chains and signatures ---
function cleanMessage(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/On .{5,80}wrote:\s*/gi, '')
    .replace(/_{5,}/g, '')
    .replace(/<[^>]+>/g, ' ')               // strip any HTML tags
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- Embed with Voyage AI (1024 dims) ---
async function embed(text) {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${VOYAGE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'voyage-multilingual-2', input: [text.slice(0, 16000)] }),
  });
  if (!res.ok) throw new Error(`Voyage error ${res.status}: ${await res.text()}`);
  return (await res.json()).data[0].embedding;
}

// --- Main ---
async function main() {
  console.log('Step 1: Collecting (ItemID, BuyerID) pairs from GetOrders...');
  const pairs = await collectOrderPairs();

  if (pairs.length === 0) {
    console.log('No order pairs found. Check that EBAY_AUTH_TOKEN is for the DSA seller account.');
    return;
  }

  console.log(`\nStep 2: Fetching member messages for ${pairs.length} pairs...`);
  let inserted = 0, skipped = 0, noReply = 0, errors = 0;

  for (let i = 0; i < pairs.length; i++) {
    const { itemId, buyerId } = pairs[i];
    process.stdout.write(
      `\r  Pair ${i + 1}/${pairs.length} | inserted: ${inserted} skipped: ${skipped} no-reply: ${noReply}   `
    );

    try {
      const exchanges = await fetchMemberMessages(itemId, buyerId);

      for (const exchange of exchanges) {
        const customerText = cleanMessage(exchange.Question?.Body);
        const repText      = cleanMessage(exchange.Response?.Body);

        if (!customerText || customerText.length < 10) { skipped++; continue; }
        if (!repText      || repText.length < 5)       { noReply++; continue; }

        const threadId = String(exchange.Question?.MessageID || `${itemId}|${buyerId}`);

        // Skip if already imported
        const { data: existing } = await supabase
          .from('historical_qa')
          .select('id')
          .eq('source', 'ebay')
          .eq('source_thread_id', threadId)
          .maybeSingle();
        if (existing) { skipped++; continue; }

        const language  = detectLanguage(customerText);
        const embedding = await embed(`${customerText}\n\n${repText}`);

        const { error } = await supabase.from('historical_qa').insert({
          source:           'ebay',
          source_thread_id: threadId,
          customer_handle:  buyerId,
          language,
          customer_text:    customerText,
          rep_text:         repText,
          occurred_at:      exchange.CreationDate
                              ? new Date(exchange.CreationDate).toISOString()
                              : null,
          embedding,
          metadata: { item_id: itemId, buyer_id: buyerId },
        });

        if (error) { console.error(`\n  Insert error: ${error.message}`); errors++; }
        else inserted++;
      }
    } catch (e) {
      console.error(`\n  Error (${itemId}|${buyerId}): ${e.message}`);
      errors++;
    }

    await delay(220); // ~4.5 calls/sec — under eBay's 5/sec limit
  }

  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`DONE: ${inserted} Q&A pairs inserted`);
  console.log(`      ${skipped} skipped (dup or empty), ${noReply} without rep reply, ${errors} errors`);
  console.log(`Verify: SELECT source, language, COUNT(*) FROM historical_qa GROUP BY 1, 2;`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
