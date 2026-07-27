// Safeguard warning: emails ONCE when a US/Canada order crosses the 5-day
// unshipped mark — not every day. Each order is warned about a single time
// (us_overdue_notified_at); the OMS page keeps showing it in red until it's
// marked shipped, so the standing reminder lives there, not in the inbox.
//
// Runs on a Vercel cron (see vercel.json). Cron requests carry no user session,
// so they authenticate with CRON_SECRET instead.
import { createClient } from '@supabase/supabase-js';

const OVERDUE_DAYS = 5;

function daysWaiting(o) {
  const start = o.order_date || o.created_at;
  if (!start) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 86400000));
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default async function handler(req, res) {
  // Vercel cron sends `Authorization: Bearer <CRON_SECRET>`; allow a manual
  // run with the same secret as a query param for testing.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  const ok = secret && (auth === `Bearer ${secret}` || req.query?.secret === secret);
  if (!ok) return res.status(401).json({ error: 'Not authorised' });

  try {
    const supabase = createClient(
      process.env.REACT_APP_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Sync WooCommerce FIRST. Juan fulfils in ShipStation and marks the order
    // Completed in WooCommerce — he never touches the OMS — so without this the
    // warning would fire on orders that have long since shipped.
    let synced = null;
    try {
      const r = await fetch(process.env.REACT_APP_SUPABASE_URL + '/functions/v1/woo-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
        body: '{}',
      });
      synced = await r.json();
    } catch (e) {
      synced = { error: e.message };   // warn anyway — better a false alarm than silence
    }

    const { data, error } = await supabase
      .from('orders')
      .select('id, order_ref, customer_name, address, order_date, created_at, us_status, us_sent_at, us_overdue_notified_at')
      .eq('fulfillment_team', 'us_team')
      .eq('archived', false)
      .neq('us_status', 'shipped')
      .order('order_date', { ascending: true });
    if (error) throw error;

    const open = data || [];
    const overdue = open.filter(o => daysWaiting(o) >= OVERDUE_DAYS);
    // Only warn about orders not already warned about — one email per order.
    const toWarn = overdue.filter(o => !o.us_overdue_notified_at);

    if (toWarn.length === 0) {
      return res.status(200).json({
        sent: false, synced, open: open.length, overdue: overdue.length,
        reason: overdue.length ? 'already warned about these' : 'nothing overdue',
      });
    }

    const rows = toWarn.map(o => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee"><strong>${esc(o.order_ref)}</strong></td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(o.customer_name)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(o.address)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#c00;font-weight:bold">${daysWaiting(o)} days</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${o.us_status === 'sent' ? 'sent to Juan' : 'not sent yet'}</td>
      </tr>`).join('');

    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
        <p><strong>${toWarn.length} US/Canada order${toWarn.length !== 1 ? 's have' : ' has'} not been marked shipped
        after ${OVERDUE_DAYS}+ days.</strong></p>
        <p>Please check with Juan that ${toWarn.length !== 1 ? 'these were' : 'this was'} fulfilled in ShipStation.</p>
        <table style="border-collapse:collapse;font-size:13px;margin-top:10px">
          <tr style="background:#f5f5f4">
            <th style="text-align:left;padding:6px 10px">Order</th>
            <th style="text-align:left;padding:6px 10px">Customer</th>
            <th style="text-align:left;padding:6px 10px">Ship to</th>
            <th style="text-align:left;padding:6px 10px">Waiting</th>
            <th style="text-align:left;padding:6px 10px">Status</th>
          </tr>
          ${rows}
        </table>
        <p style="margin-top:14px">
          <a href="https://seatcover-oms.vercel.app" style="color:#185FA5">Open the OMS → US / Canada (Juan)</a>
        </p>
        <p style="color:#888;font-size:11px">${open.length} US/CA order${open.length !== 1 ? 's are' : ' is'} open in total.
        You only get this warning once per order — the OMS page keeps showing it in red until it's marked shipped.</p>
      </div>`;

    const to = process.env.GMAIL_USER || process.env.SENDER_EMAIL;
    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: to, pass: process.env.GMAIL_APP_PASSWORD },
    });
    await transporter.sendMail({
      from: to,
      to,
      subject: `⚠ ${toWarn.length} US/Canada order${toWarn.length !== 1 ? 's' : ''} unshipped after ${OVERDUE_DAYS} days`,
      html,
    });

    // Mark them warned only after the mail actually went out, so a send
    // failure retries tomorrow instead of silently swallowing the warning.
    await supabase
      .from('orders')
      .update({ us_overdue_notified_at: new Date().toISOString() })
      .in('id', toWarn.map(o => o.id));

    return res.status(200).json({ sent: true, synced, open: open.length, overdue: overdue.length, warned: toWarn.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
