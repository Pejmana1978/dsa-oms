// Render the packing slip for a stock order and a normal order, and assert the
// inventory marking appears exactly where it should.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/lib/printPackingSlip.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/^export /gm, '');

let captured = '';
const stub = {
  window: { open: () => ({ document: { write: (h) => { captured = h }, close() {} } }), alert: () => {} },
};
const fn = new Function('window', 'getOrderItems', 'itemThumb', src + '\nreturn printPackingSlip;');
const getOrderItems = (o) => o.items || [{ title: o.car, quantity: o.quantity || 1, price: o.sale_amount, currency: o.sale_currency }];
const itemThumb = () => '';
const printPackingSlip = fn(stub.window, getOrderItems, itemThumb);

const base = {
  order_ref: '59795', customer_name: 'Evandro Zuanazzi',
  address: 'Leo tedesco 1030, Dois Vizinhos, 85660-000, BR',
  car: 'Mercedes-Benz C-Class 2014-2021 (W205)', quantity: 1,
  sale_amount: 289, sale_currency: 'EUR', order_date: '2026-03-05',
};

let bad = 0;
const ok = (n, c, extra='') => { console.log(`${c ? '  PASS' : '  FAIL'}  ${n}${extra?' — '+extra:''}`); if (!c) bad = 1; };

printPackingSlip({ ...base, ship_from_stock: true, stock_item: { model: 'W205', type: 'Vinyl', colour: 'Black' } });
const stockHtml = captured;

ok('stock order shows one concise inventory line',
   /FROM INVENTORY:\s*W205 · Vinyl · Black/.test(stockHtml));
ok('no verbose explanation text', !/picked from stock|Stock item:/.test(stockHtml));
ok('line appears above the items table',
   stockHtml.indexOf('FROM INVENTORY') < stockHtml.indexOf('<table>'));

printPackingSlip({ ...base, ship_from_stock: false });
const normalHtml = captured;

ok('normal order shows nothing about inventory', !normalHtml.includes('FROM INVENTORY'));
ok('normal order still renders items', normalHtml.includes('Mercedes-Benz C-Class'));

console.log('\n' + (bad ? 'RESULT: FAILURES' : 'RESULT: ALL PASSED'));
process.exit(bad);
