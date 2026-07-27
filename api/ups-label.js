import { requireUser } from './_auth.js';

const EU_COUNTRIES = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'];

// Hand-edited addresses often end with the country spelled out ("United
// Kingdom") instead of the ISO code UPS requires — translate instead of failing.
const COUNTRY_NAME_TO_CODE = {
  'united kingdom': 'GB', 'great britain': 'GB', 'england': 'GB', 'scotland': 'GB', 'wales': 'GB', 'northern ireland': 'GB',
  'germany': 'DE', 'france': 'FR', 'sweden': 'SE', 'denmark': 'DK', 'norway': 'NO', 'finland': 'FI', 'iceland': 'IS',
  'italy': 'IT', 'spain': 'ES', 'portugal': 'PT', 'netherlands': 'NL', 'the netherlands': 'NL', 'belgium': 'BE',
  'austria': 'AT', 'switzerland': 'CH', 'ireland': 'IE', 'poland': 'PL', 'hungary': 'HU', 'greece': 'GR',
  'czech republic': 'CZ', 'czechia': 'CZ', 'slovakia': 'SK', 'slovenia': 'SI', 'croatia': 'HR', 'romania': 'RO',
  'bulgaria': 'BG', 'luxembourg': 'LU', 'estonia': 'EE', 'latvia': 'LV', 'lithuania': 'LT', 'malta': 'MT', 'cyprus': 'CY',
  'australia': 'AU', 'new zealand': 'NZ', 'united states': 'US', 'usa': 'US', 'canada': 'CA', 'japan': 'JP',
};

// UPS field limits (Shipping API): each address line max 35 chars, up to 3
// lines; name/attention 35; city 30; postcode 9. Anything longer is rejected
// outright — e.g. "3 Perth Close (No 4 if not in), Micklover, Derby" (47).
const UPS_LINE = 35;

function addressLines(street) {
  const words = String(street || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const word = w.length > UPS_LINE ? w.slice(0, UPS_LINE) : w;
    if (!cur) { cur = word; continue; }
    if ((cur + ' ' + word).length <= UPS_LINE) { cur += ' ' + word; continue; }
    lines.push(cur);
    cur = word;
    if (lines.length === 3) { cur = ''; break; }   // UPS accepts at most 3
  }
  if (cur && lines.length < 3) lines.push(cur);
  return lines.length ? lines : [''];
}

const cap = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

function parseShipAddress(address) {
  const parts = (address || '').split(',').map(s => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const countryCode = /^[A-Za-z]{2}$/.test(last)
    ? last.toUpperCase()
    : (COUNTRY_NAME_TO_CODE[last.toLowerCase()] || null);
  return {
    countryCode,
    last,
    postcode: parts[parts.length - 2] || '',
    city: parts[parts.length - 3] || '',
    street: parts.slice(0, Math.max(parts.length - 3, 0)).join(', '),
  };
}

async function getUPSToken() {
  const res = await fetch('https://onlinetools.ups.com/security/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${process.env.UPS_CLIENT_ID}:${process.env.UPS_CLIENT_SECRET}`).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  const data = await res.json();
  return data.access_token;
}

async function validateAddress(token, address) {
  const { countryCode, postcode, city, street } = parseShipAddress(address);
  const res = await fetch('https://onlinetools.ups.com/api/addressvalidation/v2/1', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      XAVRequest: {
        AddressKeyFormat: {
          AddressLine: addressLines(street),
          PoliticalDivision2: cap(city, 30),
          PostcodePrimaryLow: cap(postcode, 9),
          CountryCode: countryCode
        }
      }
    })
  });
  return await res.json();
}

const SERVICE_NAMES = {
  '11': 'UPS Standard',
  '65': 'UPS Express Saver',
  '07': 'UPS Express',
  '08': 'UPS Expedited',
  '54': 'UPS Express Plus',
  '96': 'UPS Express Freight',
};

// Price the exact same shipment the label would create, across ALL available
// services ("Shop") — used for the choose-and-confirm step. Nothing is
// created or billed by this call.
async function rateShipment(token, order, ddp = false) {
  const { countryCode, postcode, city, street } = parseShipAddress(order.address);
  const isNonEU = !EU_COUNTRIES.includes(countryCode);
  const account = process.env.UPS_ACCOUNT_NUMBER;
  // Billing duties to us (DDP) adds UPS's duty-forwarding fee to the quote,
  // so the two terms must be priced separately.
  const charges = [{ Type: '01', BillShipper: { AccountNumber: account } }];
  if (ddp && isNonEU) charges.push({ Type: '02', BillShipper: { AccountNumber: account } });
  const body = {
    RateRequest: {
      Request: { TransactionReference: { CustomerContext: String(order.order_ref || 'quote') } },
      Shipment: {
        Shipper: {
          Name: 'DSA Auto Seat Factory AB',
          ShipperNumber: process.env.UPS_ACCOUNT_NUMBER,
          Address: { AddressLine: 'Killingevägen 32', City: 'Lidingö', PostalCode: '18164', CountryCode: 'SE' }
        },
        ShipTo: { Name: cap(order.customer_name || 'Customer', 35), Address: { AddressLine: addressLines(street), City: cap(city, 30), PostalCode: cap(postcode, 9), CountryCode: countryCode } },
        ShipFrom: { Name: 'DSA Auto Seat Factory AB', Address: { AddressLine: 'Killingevägen 32', City: 'Lidingö', PostalCode: '18164', CountryCode: 'SE' } },
        PaymentDetails: { ShipmentCharge: charges },
        ShipmentRatingOptions: { NegotiatedRatesIndicator: 'X' },
        // Ask UPS for time-in-transit so the picker can show estimated delivery.
        DeliveryTimeInformation: {
          PackageBillType: '03',
          Pickup: { Date: new Date().toISOString().slice(0, 10).replace(/-/g, '') }
        },
        Package: {
          PackagingType: { Code: '02' },
          Dimensions: { UnitOfMeasurement: { Code: 'CM' }, Length: '45', Width: '45', Height: '2' },
          PackageWeight: { UnitOfMeasurement: { Code: 'KGS' }, Weight: '1' }
        }
      }
    }
  };
  const res = await fetch('https://onlinetools.ups.com/api/rating/v2409/Shop', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'transId': String(order.order_ref || 'quote'),
      'transactionSrc': 'seatcover-oms'
    },
    body: JSON.stringify(body)
  });
  return await res.json();
}

// Who pays the destination country's import duties & taxes on a non-EU
// shipment. 'receiver' (DAP) = UPS bills the customer on delivery — the
// default and what every past label used. 'sender' (DDP) = billed to our
// own UPS account so the customer is never asked for money.
export const DUTIES_PAYERS = ['receiver', 'sender'];

export function buildShipmentBody(order, serviceCode, dutiesPayer = 'receiver') {
  const { countryCode, postcode, city, street: addressLine } = parseShipAddress(order.address);
  const isNonEU = !EU_COUNTRIES.includes(countryCode);
  const service = SERVICE_NAMES[serviceCode] ? serviceCode : '11';
  const account = process.env.UPS_ACCOUNT_NUMBER;

  // Type 01 = transportation (always ours). Type 02 = duties & taxes, and it
  // must be OMITTED for receiver-pays — sending it with BillReceiver but no
  // receiver account is what UPS rejects.
  const shipmentCharges = [
    { Type: '01', BillShipper: { AccountNumber: account } },
  ];
  if (isNonEU && dutiesPayer === 'sender') {
    shipmentCharges.push({ Type: '02', BillShipper: { AccountNumber: account } });
  }

  const shipmentBody = {
    ShipmentRequest: {
      Shipment: {
        // Required by UPS for international (incl. post-Brexit UK) shipments.
        Description: 'Car seat covers',
        Shipper: {
          Name: 'DSA Auto Seat Factory AB',
          AttentionName: 'DSA Seat Factory',
          Phone: { Number: '+46855925449' },
          ShipperNumber: process.env.UPS_ACCOUNT_NUMBER,
          Address: {
            AddressLine: 'Killingevägen 32',
            City: 'Lidingö',
            PostalCode: '18164',
            CountryCode: 'SE'
          }
        },
        ShipTo: {
          Name: cap(order.customer_name || 'Customer', 35),
          AttentionName: cap(order.customer_name || 'Customer', 35),
          Phone: { Number: order.phone || '' },
          Address: {
            AddressLine: addressLines(addressLine),
            City: cap(city, 30),
            PostalCode: cap(postcode, 9),
            CountryCode: countryCode
          }
        },
        PaymentInformation: { ShipmentCharge: shipmentCharges },
        // NOTE: must be ShipmentRatingOptions — the old RateInformation field is
        // silently ignored by the REST API, which billed published rates.
        ShipmentRatingOptions: { NegotiatedRatesIndicator: 'X' },
        Service: { Code: service, Description: SERVICE_NAMES[service] },
        Package: {
          Packaging: { Code: '02' },
          Dimensions: {
            UnitOfMeasurement: { Code: 'CM' },
            Length: '45', Width: '45', Height: '2'
          },
          PackageWeight: {
            UnitOfMeasurement: { Code: 'KGS' },
            Weight: '1'
          }
        },
        ...(isNonEU && {
          // Must sit inside ShipmentServiceOptions — placed directly under
          // Shipment, UPS silently ignores it (label but "No forms to print").
          // FormType 01 = UPS GENERATES the commercial invoice.
          ShipmentServiceOptions: {
          InternationalForms: {
            FormType: '01',
            InvoiceNumber: String(order.order_ref || '').slice(0, 35),
            InvoiceDate: new Date().toISOString().slice(0,10).replace(/-/g,''),
            ReasonForExport: 'SAMPLE',
            CurrencyCode: 'USD',
            Contacts: {
              SoldTo: {
                Name: cap(order.customer_name || 'Customer', 35),
                AttentionName: cap(order.customer_name || 'Customer', 35),
                Phone: { Number: order.phone || '0000000000' },
                Address: {
                  AddressLine: addressLines(addressLine),
                  City: cap(city, 30),
                  PostalCode: cap(postcode, 9),
                  CountryCode: countryCode
                }
              }
            },
            Product: [{
              Description: 'Seat Cover Sample',
              CommodityCode: '980100',
              OriginCountryCode: 'US',
              Unit: { Number: '1', UnitOfMeasurement: { Code: 'EA' }, Value: '1.00' }
            }]
          }
          }
        })
      },
      LabelSpecification: {
        LabelImageFormat: { Code: 'PDF' },
        LabelStockSize: { Height: '6', Width: '4' }
      }
    }
  };
  return shipmentBody;
}

async function createLabel(token, order, serviceCode, dutiesPayer, baseUrl = 'https://onlinetools.ups.com') {
  const shipmentBody = buildShipmentBody(order, serviceCode, dutiesPayer);
  const res = await fetch(`${baseUrl}/api/shipments/v1/ship`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(shipmentBody)
  });
  return await res.json();
}

async function sendExportEmail(trackingNumber, invoiceBase64) {
  // Preferred: send through the company's own Google Workspace account —
  // no sender-domain DNS setup needed, and the email lands in Gmail's Sent
  // folder as the paper trail. Falls back to Resend if Gmail isn't configured.
  if (process.env.GMAIL_APP_PASSWORD) {
    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER || process.env.SENDER_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
    await transporter.sendMail({
      from: process.env.GMAIL_USER || process.env.SENDER_EMAIL,
      to: 'exportsthlm@ups.com',
      subject: trackingNumber,
      html: '<p>Please find the UPS export invoice attached.</p>',
      attachments: [{
        filename: `invoice-${trackingNumber}.pdf`,
        content: invoiceBase64,
        encoding: 'base64',
      }],
    });
    return;
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.SENDER_EMAIL,
      to: 'exportsthlm@ups.com',
      bcc: process.env.SENDER_EMAIL,
      subject: trackingNumber,
      html: '<p>Please find the UPS export invoice attached.</p>',
      attachments: [{
        filename: `invoice-${trackingNumber}.pdf`,
        content: invoiceBase64
      }]
    })
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await requireUser(req, res))) return;
  const { order, validateOnly, quoteOnly, serviceCode, dutiesPayer } = req.body;
  const parsed = parseShipAddress(order?.address);
  if (!parsed.countryCode) {
    return res.status(400).json({ error: `Can't read the country from the address — the last line must be a 2-letter code or country name (got "${parsed.last}")` });
  }
  try {
    const token = await getUPSToken();

    if (validateOnly) {
      const validation = await validateAddress(token, order.address);
      return res.status(200).json({ validation });
    }

    if (quoteOnly) {
      const isNonEU = !EU_COUNTRIES.includes(parsed.countryCode);
      const parseServices = (data) => {
        const errs = data.response?.errors;
        if (errs) throw new Error(`UPS ${errs[0]?.code}: ${errs[0]?.message}`);
        const rs = data.RateResponse?.RatedShipment;
        return (Array.isArray(rs) ? rs : [rs]).filter(Boolean).map(r => {
          const eta = r.TimeInTransit?.ServiceSummary?.EstimatedArrival;
          return {
            code: r.Service?.Code,
            name: SERVICE_NAMES[r.Service?.Code] || ('UPS service ' + r.Service?.Code),
            publishedRate: r.TotalCharges?.MonetaryValue || null,
            negotiatedRate: r.NegotiatedRateCharges?.TotalCharge?.MonetaryValue || null,
            currency: r.NegotiatedRateCharges?.TotalCharge?.CurrencyCode || r.TotalCharges?.CurrencyCode || null,
            etaDate: eta?.Arrival?.Date || null,          // YYYYMMDD
            etaDays: eta?.BusinessDaysInTransit || r.GuaranteedDelivery?.BusinessDaysInTransit || null,
          };
        }).sort((a, b) =>
          parseFloat(a.negotiatedRate ?? a.publishedRate ?? '9e9') - parseFloat(b.negotiatedRate ?? b.publishedRate ?? '9e9')
        );
      };
      // Outside the EU, price BOTH duty terms up front (DDP carries UPS's
      // duty-forwarding fee) so switching the choice updates instantly.
      const [dapData, ddpData] = await Promise.all([
        rateShipment(token, order, false),
        isNonEU ? rateShipment(token, order, true) : Promise.resolve(null),
      ]);
      const services = parseServices(dapData);
      const servicesDdp = ddpData ? parseServices(ddpData) : null;
      return res.status(200).json({ quote: true, services, servicesDdp, isNonEU });
    }

    const payer = DUTIES_PAYERS.includes(dutiesPayer) ? dutiesPayer : 'receiver';
    const result = await createLabel(token, order, serviceCode, payer);
    if (result.response?.errors) {
      return res.status(400).json({ error: result.response.errors[0]?.message || 'UPS error' });
    }

    const shipment = result.ShipmentResponse?.ShipmentResults;
    const trackingNumber = shipment?.ShipmentIdentificationNumber;
    const labelBase64 = shipment?.PackageResults?.ShippingLabel?.GraphicImage;
    // Surface what UPS will actually charge: negotiated (contract) rate when
    // applied, published otherwise — so a missing discount is visible instantly.
    const negotiated = shipment?.NegotiatedRateCharges?.TotalCharge;
    const published = shipment?.ShipmentCharges?.TotalCharges;

    const isNonEU = !EU_COUNTRIES.includes(parsed.countryCode);

    // Report the customs-invoice outcome explicitly — never fail silently.
    let customs = null;
    if (isNonEU) {
      const formImage = shipment?.Form?.Image?.GraphicImage;
      if (!formImage) {
        customs = { generated: false, emailed: false, error: 'UPS did not return a customs invoice' };
      } else {
        try {
          await sendExportEmail(trackingNumber, formImage);
          customs = { generated: true, emailed: true };
        } catch (e) {
          customs = { generated: true, emailed: false, error: e.message };
        }
      }
    }

    return res.status(200).json({
      trackingNumber,
      labelBase64,
      negotiatedRate: negotiated?.MonetaryValue || null,
      publishedRate: published?.MonetaryValue || null,
      rateCurrency: negotiated?.CurrencyCode || published?.CurrencyCode || null,
      customs,
      dutiesPayer: isNonEU ? payer : null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
