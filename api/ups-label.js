import { requireUser } from './_auth.js';

const EU_COUNTRIES = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'];

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
  const parts = address.split(',').map(s => s.trim());
  const countryCode = parts[parts.length - 1];
  const postcode = parts[parts.length - 2];
  const city = parts[parts.length - 3];
  const street = parts.slice(0, parts.length - 3).join(', ');
  const res = await fetch('https://onlinetools.ups.com/api/addressvalidation/v2/1', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      XAVRequest: {
        AddressKeyFormat: {
          AddressLine: street,
          PoliticalDivision2: city,
          PostcodePrimaryLow: postcode,
          CountryCode: countryCode
        }
      }
    })
  });
  return await res.json();
}

async function createLabel(token, order) {
  const parts = order.address.split(',').map(s => s.trim());
  const countryCode = parts[parts.length - 1];
  const postcode = parts[parts.length - 2];
  const city = parts[parts.length - 3];
  const addressLine = parts.slice(0, parts.length - 3).join(', ');
  const isNonEU = !EU_COUNTRIES.includes(countryCode);

  const shipmentBody = {
    ShipmentRequest: {
      Shipment: {
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
          Name: order.customer_name,
          AttentionName: order.customer_name,
          Phone: { Number: order.phone || '' },
          Address: {
            AddressLine: addressLine,
            City: city,
            PostalCode: postcode,
            CountryCode: countryCode
          }
        },
        PaymentInformation: {
          ShipmentCharge: {
            Type: '01',
            BillShipper: { AccountNumber: process.env.UPS_ACCOUNT_NUMBER }
          }
        },
        RateInformation: { NegotiatedRatesIndicator: '' },
        Service: { Code: '11', Description: 'UPS Standard' },
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
          InternationalForms: {
            FormType: '07',
            InvoiceDate: new Date().toISOString().slice(0,10).replace(/-/g,''),
            ReasonForExport: 'SAMPLE',
            CurrencyCode: 'USD',
            Product: [{
              Description: 'Seat Cover Sample',
              CommodityCode: '980100',
              OriginCountryCode: 'US',
              Unit: { Number: '1', UnitOfMeasurement: { Code: 'EA' }, Value: '1.00' }
            }]
          }
        })
      },
      LabelSpecification: {
        LabelImageFormat: { Code: 'PDF' },
        LabelStockSize: { Height: '6', Width: '4' }
      }
    }
  };

  const res = await fetch('https://onlinetools.ups.com/api/shipments/v1/ship', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(shipmentBody)
  });
  return await res.json();
}

async function sendExportEmail(trackingNumber, invoiceBase64) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.SENDER_EMAIL,
      to: 'exportsthlm@ups.com',
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
  const { order, validateOnly } = req.body;
  try {
    const token = await getUPSToken();

    if (validateOnly) {
      const validation = await validateAddress(token, order.address);
      return res.status(200).json({ validation });
    }

    const result = await createLabel(token, order);
    if (result.response?.errors) {
      return res.status(400).json({ error: result.response.errors[0]?.message || 'UPS error' });
    }

    const shipment = result.ShipmentResponse?.ShipmentResults;
    const trackingNumber = shipment?.ShipmentIdentificationNumber;
    const labelBase64 = shipment?.PackageResults?.ShippingLabel?.GraphicImage;

    const parts = order.address.split(',').map(s => s.trim());
    const countryCode = parts[parts.length - 1];
    const isNonEU = !EU_COUNTRIES.includes(countryCode);

    if (isNonEU && shipment?.Form?.Image?.GraphicImage) {
      await sendExportEmail(trackingNumber, shipment.Form.Image.GraphicImage);
    }

    return res.status(200).json({ trackingNumber, labelBase64 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
