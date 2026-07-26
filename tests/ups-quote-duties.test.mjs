// Exercises the real handler's quote path (both duty terms) and the UI's
// price/surcharge maths — no labels created, quotes only.
import handler from '../api/ups-label.js';

let code = 0;
const ok = (n, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); if (!c) code = 1; };

// Minimal Express-ish req/res doubles; bypass auth by faking requireUser's fetch.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'test-user' }) };
  return realFetch(url, opts);
};

function call(body) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); },
      end() { resolve({ status: this.statusCode, body: null }); },
    };
    handler({ method: 'POST', headers: { authorization: 'Bearer fake' }, body }, res);
  });
}

const UK = { order_ref: 'Q-UK', customer_name: 'Rob Ambrose', phone: '447546466337', address: '8 Potters Lane, Surrey, GU23 7AE, GB' };
const DE = { order_ref: 'Q-DE', customer_name: 'Test DE', phone: '4915100000', address: 'Wölfelsdorfer Ring 8, Peine, 31224, DE' };

console.log('UK (non-EU) quote');
const uk = await call({ order: UK, quoteOnly: true });
ok('returns 200', uk.status === 200, JSON.stringify(uk.body).slice(0, 120));
ok('isNonEU true', uk.body?.isNonEU === true);
ok('has DAP services', Array.isArray(uk.body?.services) && uk.body.services.length > 0, (uk.body?.services || []).length + ' services');
ok('has DDP services', Array.isArray(uk.body?.servicesDdp) && uk.body.servicesDdp.length > 0, (uk.body?.servicesDdp || []).length + ' services');

if (uk.body?.services && uk.body?.servicesDdp) {
  const std = uk.body.services.find(s => s.code === '11');
  const stdD = uk.body.servicesDdp.find(s => s.code === '11');
  const diff = (parseFloat(stdD.negotiatedRate) - parseFloat(std.negotiatedRate)).toFixed(2);
  console.log(`     UPS Standard: customer-pays ${std.negotiatedRate} ${std.currency} | we-pay ${stdD.negotiatedRate} ${stdD.currency} | surcharge +${diff}`);
  ok('DDP price is higher than DAP', parseFloat(stdD.negotiatedRate) > parseFloat(std.negotiatedRate));
  ok('surcharge is a sane amount (0 < x < 100)', Number(diff) > 0 && Number(diff) < 100, `+${diff}`);
  ok('every DAP service has a DDP counterpart',
    uk.body.services.every(s => uk.body.servicesDdp.some(d => d.code === s.code)));
}

console.log('\nDE (EU) quote');
const de = await call({ order: DE, quoteOnly: true });
ok('returns 200', de.status === 200);
ok('isNonEU false', de.body?.isNonEU === false);
ok('no DDP list for EU (choice hidden)', de.body?.servicesDdp === null);
ok('still has services', (de.body?.services || []).length > 0, (de.body?.services || []).length + ' services');

console.log('\nGuards');
const bad = await call({ order: { address: 'Nowhere, Somewhere, 12345, Freedonia' }, quoteOnly: true });
ok('unreadable country rejected with a clear message', bad.status === 400 && /country/i.test(bad.body?.error || ''), bad.body?.error);

console.log('\n' + (code ? 'RESULT: FAILURES' : 'RESULT: ALL PASSED'));
process.exit(code);
