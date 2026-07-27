// Reproduce Rob Ambrose's failure, then confirm the fix, in the UPS sandbox.
import { buildShipmentBody } from '../api/ups-label.js';
const CIE = 'https://wwwcie.ups.com';

const ORDERS = [
  { label: 'Rob Ambrose (long street, the failing one)',
    order_ref: '02-14952-70311', customer_name: 'Rob Ambrose', phone: '447700900000',
    address: '3 Perth Close (No 4 if not in), Micklover, Derby,Derbyshire,DE39LB, GB' },
  { label: 'martin palmer (short, known good)',
    order_ref: '23-14907-21162', customer_name: 'martin palmer', phone: '447546466337',
    address: '8 Potters Lane, Surrey,GU23 7AE, GB' },
  { label: 'very long name + very long street',
    order_ref: 'TEST-LONG', customer_name: 'Bartholomew Featherstonehaugh-Cholmondeley III',
    phone: '447700900001',
    address: 'Flat 12b The Old Biscuit Factory Building, 199 Bermondsey Street, London, SE1 3TQ, GB' },
];

async function token() {
  const res = await fetch(`${CIE}/security/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${process.env.UPS_CLIENT_ID}:${process.env.UPS_CLIENT_SECRET}`).toString('base64') },
    body: 'grant_type=client_credentials',
  });
  return (await res.json()).access_token;
}

const t = await token();
let bad = 0;

for (const o of ORDERS) {
  const body = buildShipmentBody(o, '11', 'receiver');
  const ship = body.ShipmentRequest.Shipment;
  const shipToLines = [].concat(ship.ShipTo.Address.AddressLine);
  const soldTo = ship.ShipmentServiceOptions?.InternationalForms?.Contacts?.SoldTo;
  const soldToLines = [].concat(soldTo?.Address?.AddressLine ?? []);
  const tooLong = [...shipToLines, ...soldToLines].filter(l => String(l).length > 35);

  const res = await fetch(`${CIE}/api/shipments/v1/ship`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await res.json();
  const err = d.response?.errors?.[0];
  const tracking = d.ShipmentResponse?.ShipmentResults?.ShipmentIdentificationNumber;

  console.log(`\n${o.label}`);
  console.log(`  ShipTo lines: ${JSON.stringify(shipToLines)}`);
  console.log(`  SoldTo lines: ${JSON.stringify(soldToLines)}`);
  console.log(`  name lengths: shipTo=${String(ship.ShipTo.Name).length} soldTo=${String(soldTo?.Name ?? '').length}`);
  console.log(`  over-35 lines: ${tooLong.length ? JSON.stringify(tooLong) : 'none'}`);
  if (err) { console.log(`  UPS: FAIL ${err.code} — ${err.message}`); bad = 1; }
  else console.log(`  UPS: OK — ${tracking}`);
}

console.log('\n' + (bad ? 'RESULT: at least one address still rejected' : 'RESULT: all addresses accepted'));
process.exit(bad);
