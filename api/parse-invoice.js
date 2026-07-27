import { requireUser } from './_auth.js';
import { parseStripeInvoice } from './_invoice.js';

// Reads an uploaded Stripe invoice PDF and returns the fields for a new manual
// order. Nothing is written — the operator reviews and saves in the OMS.
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

// A 576-byte PDF containing the text "OK", used by the GET health check to
// prove the PDF engine really runs in this serverless runtime. (pdf-parse
// looked fine locally but died on Vercel with "DOMMatrix is not defined",
// because it expects browser globals — hence unpdf, and hence this check.)
const SELF_TEST_PDF =
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMTAwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAzMiA+PgpzdHJlYW0KQlQgL0YxIDI0IFRmIDIwIDQwIFRkIChPSykgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzMjMgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgozOTMKJSVFT0YK';

async function pdfToText(buffer) {
  // unpdf ships a serverless-safe build of pdf.js — no DOM globals required.
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return typeof text === 'string' ? text : String(text || '');
}

export default async function handler(req, res) {
  // Health check: actually parses a tiny PDF, so it proves the engine works in
  // this runtime rather than merely that the module imports. No user data.
  if (req.method === 'GET') {
    try {
      const text = await pdfToText(Buffer.from(SELF_TEST_PDF, 'base64'));
      const ok = /OK/.test(text);
      return res.status(ok ? 200 : 500).json({ engine: 'unpdf', pdfEngineWorks: ok, extracted: text.trim().slice(0, 20) });
    } catch (e) {
      return res.status(500).json({ engine: 'unpdf', pdfEngineWorks: false, error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).end();
  if (!(await requireUser(req, res))) return;

  const { fileBase64 } = req.body || {};
  if (!fileBase64) return res.status(400).json({ error: 'No file received' });

  try {
    const buffer = Buffer.from(String(fileBase64).replace(/^data:.*?;base64,/, ''), 'base64');
    if (buffer.slice(0, 4).toString() !== '%PDF') {
      return res.status(400).json({ error: "That doesn't look like a PDF file" });
    }

    const text = await pdfToText(buffer);
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
