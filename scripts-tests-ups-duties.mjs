// Verifies the duties-payer feature against UPS's TEST environment (CIE).
// Creates real label requests in the sandbox — no money, no real shipments.
import { buildShipmentBody } from '/Users/pejmanaltafi/Dropbox/0 Pejman/Claude Projects/seat-cover/dsa-oms/api/ups-label.js';

const CIE = 'https://wwwcie.ups.com';

const UK_ORDER = {
  order_ref: 'TEST-UK-1',
  customer_name: 'Martin Palmer',
  phone: '447546466337',
  address: '8 Potters Lane, Surrey, GU23 7AE, GB',
};
const DE_ORDER = {
  order_ref: 'TEST-DE-1',
  customer_name: 'Swetlana Donhauser',
  phone: '4915140000000',
  address: 'Wölfelsdorfer Ring 8, Peine, 31224, DE',
};

async function token() {
  const res = await fetch(`${CIE}/security/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${process.env.UPS_CLIENT_ID}:${process.env.UPS_CLIENT_SECRET}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  const d = await res.json();
  if (!d.access_token) throw new Error('CIE token failed: ' + JSON.stringify(d).slice(0, 300));
  return d.access_token;
}

function check(name, cond, detail = '') {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
}

const t = await token();
console.log('UPS CIE token acquired\n');

// ---- 1. Request-shape assertions (no network) ----
console.log('REQUEST SHAPE');
const ukReceiver = buildShipmentBody(UK_ORDER, '11', 'receiver');
const ukSender = buildShipmentBody(UK_ORDER, '11', 'sender');
const deSender = buildShipmentBody(DE_ORDER, '11', 'sender');

const ukRecCharges = ukReceiver.ShipmentRequest.Shipment.PaymentInformation.ShipmentCharge;
const ukSendCharges = ukSender.ShipmentRequest.Shipment.PaymentInformation.ShipmentCharge;
const deSendCharges = deSender.ShipmentRequest.Shipment.PaymentInformation.ShipmentCharge;

check('UK receiver-pays omits Type 02', ukRecCharges.length === 1 && ukRecCharges[0].Type === '01');
check('UK we-pay adds Type 02 billed to shipper',
  ukSendCharges.length === 2 && ukSendCharges[1].Type === '02' && !!ukSendCharges[1].BillShipper?.AccountNumber);
check('EU (DE) never gets a duties charge even if asked', deSendCharges.length === 1,
  'charges=' + deSendCharges.length);
check('UK gets customs invoice block',
  !!ukReceiver.ShipmentRequest.Shipment.ShipmentServiceOptions?.InternationalForms);
check('EU gets NO customs invoice block',
  !deSender.ShipmentRequest.Shipment.ShipmentServiceOptions);
check('negotiated rates still requested',
  ukReceiver.ShipmentRequest.Shipment.ShipmentRatingOptions?.NegotiatedRatesIndicator === 'X');

// ---- 2. Live sandbox: does UPS accept both variants? ----
console.log('\nUPS SANDBOX (CIE) — real API validation');
async function ship(label, body) {
  const res = await fetch(`${CIE}/api/shipments/v1/ship`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await res.json();
  const err = d.response?.errors?.[0];
  const results = d.ShipmentResponse?.ShipmentResults;
  if (err) {
    check(label, false, `UPS ${err.code}: ${err.message}`);
    return null;
  }
  check(label, !!results?.ShipmentIdentificationNumber,
    'tracking ' + results?.ShipmentIdentificationNumber);
  return results;
}

const r1 = await ship('UK label, customer pays duties', ukReceiver);
const r2 = await ship('UK label, WE pay duties', ukSender);
const r3 = await ship('DE label (EU, no customs)', deSender);

console.log('\nOUTPUT CHECKS');
check('receiver-pays label returns a PDF', !!r1?.PackageResults?.ShippingLabel?.GraphicImage);
check('we-pay label returns a PDF', !!r2?.PackageResults?.ShippingLabel?.GraphicImage);
check('UK returns a customs invoice image to email', !!r1?.Form?.Image?.GraphicImage,
  r1?.Form?.Image?.GraphicImage ? 'present' : 'MISSING');
check('EU label returns a PDF', !!r3?.PackageResults?.ShippingLabel?.GraphicImage);

console.log('\n' + (process.exitCode ? 'RESULT: FAILURES ABOVE' : 'RESULT: ALL CHECKS PASSED'));
