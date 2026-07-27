// End-to-end: the real Stripe invoice PDF -> pdf-parse -> our field parser.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PDFParse } from 'pdf-parse';
import { parseStripeInvoice } from '../api/_invoice.js';

const here = dirname(fileURLToPath(import.meta.url));
const buf = readFileSync(join(here, 'fixtures/stripe-invoice-sample.pdf'));
const parser = new PDFParse({ data: new Uint8Array(buf) });
const { text } = await parser.getText();
await parser.destroy?.();
const r = parseStripeInvoice(text);
console.log(JSON.stringify(r, null, 1));

let bad = 0;
const ok = (name, cond, got) => { console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${got !== undefined ? ' -> ' + JSON.stringify(got) : ''}`); if (!cond) bad = 1; };
console.log('\nCHECKS');
ok('invoice number', r.invoiceNumber === '76BF5E7C-0028', r.invoiceNumber);
ok('order date', r.orderDate === '2026-07-24', r.orderDate);
ok('customer name', r.customerName === 'The Secret Events SRL', r.customerName);
ok('email is the CUSTOMER not us', r.email === 'contact@thesecretgarden.ro', r.email);
ok('phone', r.phone.replace(/\s/g, '') === '+40745654466', r.phone);
ok('address ends in ISO code', /,\s*RO$/.test(r.address), r.address);
ok('address excludes phone/VAT', !/VAT|745/.test(r.address), r.address);
ok('total', r.total === 333.84, r.total);
ok('currency', r.currency === 'EUR', r.currency);
ok('reverse charge detected', r.reverseCharge === true, r.reverseCharge);
ok('one line item', r.items.length === 1, r.items.length);
const it = r.items[0] || {};
ok('item qty', it.quantity === 1, it.quantity);
ok('item price', it.price === 333.84, it.price);
ok('car recognised', it.car === 'Mercedes-Benz GLC 2016', it.car);
ok('colour recognised', it.color === 'Beige', it.color);
ok('material (MB Tex -> Vinyl)', it.material === 'Vinyl', it.material);
ok('positions', JSON.stringify(it.position) === JSON.stringify(['Driver Bottom','Passenger Bottom']), it.position);
console.log('\n' + (bad ? 'RESULT: FAILURES' : 'RESULT: ALL PASSED'));
process.exit(bad);
