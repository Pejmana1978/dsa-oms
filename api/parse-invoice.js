import { requireUser } from './_auth.js';
import { parseStripeInvoice } from './_invoice.js';

// Reads an uploaded Stripe invoice PDF and returns the fields for a new manual
// order. Nothing is written — the operator reviews and saves in the OMS.
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await requireUser(req, res))) return;

  const { fileBase64 } = req.body || {};
  if (!fileBase64) return res.status(400).json({ error: 'No file received' });

  try {
    const buffer = Buffer.from(String(fileBase64).replace(/^data:.*?;base64,/, ''), 'base64');
    if (buffer.slice(0, 4).toString() !== '%PDF') {
      return res.status(400).json({ error: "That doesn't look like a PDF file" });
    }

    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    let text = '';
    try {
      ({ text } = await parser.getText());
    } finally {
      await parser.destroy?.();
    }
    if (!text || text.trim().length < 20) {
      return res.status(400).json({
        error: 'No text found in this PDF — if it is a scan, the details must be typed in manually',
      });
    }

    const parsed = parseStripeInvoice(text);
    if (!parsed.customerName && !parsed.invoiceNumber && parsed.items.length === 0) {
      return res.status(400).json({ error: "Couldn't read this as a Stripe invoice — check the file, or enter the order manually" });
    }
    return res.status(200).json({ parsed });
  } catch (e) {
    return res.status(500).json({ error: 'Could not read the PDF: ' + e.message });
  }
}
