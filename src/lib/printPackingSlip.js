import { getOrderItems, itemThumb } from './orderItems'

export function printPackingSlip(o) {
  const notes = o.notes || ''
  const priceMatch = notes.match(/Price:\s*([\d.]+)\s*(\w+)/)
  const items = getOrderItems(o)
  const currency = o.sale_currency || items.find(it => it.currency)?.currency || (priceMatch ? priceMatch[2] : '')
  // Per-item prices when we have them; legacy single-item fallback uses sale_amount.
  const itemsSubtotal = items.reduce((s, it) => s + (it.price != null ? Number(it.price) : 0), 0)
  const orderTotal = o.sale_amount != null ? Number(o.sale_amount) : (itemsSubtotal || (priceMatch ? Number(priceMatch[1]) : 0))
  const subtotal = itemsSubtotal || orderTotal
  const postage = Math.max(0, orderTotal - subtotal)
  const fmt = (n) => (Number(n) || 0).toFixed(2)
  const positions = Array.isArray(o.position) ? o.position.filter(Boolean).join(', ') : (o.position || '')
  const allPositions = [positions, o.position_other].filter(Boolean).join(', ')
  const color = o.color || ''
  const multi = items.length > 1
  const itemRows = items.map(it => {
    const linePrice = it.price != null ? fmt(it.price) : (multi ? '—' : fmt(orderTotal))
    const details = [
      multi ? '' : (allPositions ? `Positions: ${allPositions}` : ''),
      multi ? '' : (color ? `Color: ${color}` : ''),
    ].filter(Boolean).map(d => `<br/>${d}`).join('')
    return `<tr><td>${itemThumb(it) ? `<img src="${itemThumb(it)}" style="width:100px;height:100px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:10px"/>` : ''}<span style="display:inline-block;vertical-align:middle;max-width:340px"><strong>${it.title || o.car || ''}</strong>${details}</span></td><td>${it.quantity || 1}</td><td>${currency} ${linePrice}</td><td>0%</td><td>${currency} ${linePrice}</td></tr>`
  }).join('')
  const sharedDetails = multi && (allPositions || color)
    ? `<div style="font-size:12px;margin-top:8px">${allPositions ? `Positions: ${allPositions}` : ''}${allPositions && color ? ' · ' : ''}${color ? `Color: ${color}` : ''}</div>`
    : ''
  const w = window.open('', '_blank')
  w.document.write(`<html><head><title>Packing Slip ${o.order_ref}</title><style>body{font-family:Arial,sans-serif;padding:32px;font-size:13px}h1{text-align:center;font-size:18px;margin:0}.subtitle{text-align:center;font-size:12px;color:#555;margin-bottom:20px}.header-right{position:absolute;top:32px;right:32px;font-size:13px;font-weight:bold}.addresses{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:20px}.address-box{font-size:12px;line-height:1.6}.address-box strong{display:block;margin-bottom:4px}.contact{font-size:12px;margin-bottom:16px}.order-id{font-size:18px;font-weight:bold}.order-date{font-size:13px;float:right;margin-top:-24px}table{width:100%;border-collapse:collapse;margin-top:16px}th{text-align:left;font-size:12px;border-bottom:2px solid #000;padding:6px 8px}td{padding:10px 8px;font-size:12px;border-bottom:1px solid #ddd;vertical-align:top}.totals{float:right;margin-top:16px;font-size:12px;line-height:2}.totals strong{display:inline-block;min-width:140px}.message{font-size:12px;margin-top:16px;max-width:240px}@media print{button{display:none}}</style></head><body style="position:relative"><div class="header-right">INVOICE/PACKING SLIP</div><h1>DSA Seat Factory</h1><div class="subtitle">www.dsaseatfactory.com</div><div class="addresses"><div class="address-box"><strong>Post to</strong>${o.customer_name}<br/>${(o.address||'').replace(/,/g,'<br/>')}</div><div class="address-box"><strong>Post from</strong>DSA Auto Seat Factory AB<br/>Vasavägen 78<br/>Lidingö, Stockholm<br/>18141<br/>Sweden<br/>VAT ID: SE 556861974501</div><div class="address-box"><strong>Buyer registration address</strong>${o.customer_name}<br/>${(o.address||'').replace(/,/g,'<br/>')}</div></div><div class="contact">${o.phone||''}<br/>${o.email||''}</div><div class="order-id">Order: ${o.order_ref}</div><div class="order-date">Order date: ${o.order_date?new Date(o.order_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—'}</div><div style="clear:both"></div>${multi?`<div style="background:#FFFBEB;border:1px solid #F59E0B;border-radius:4px;padding:5px 10px;margin-top:10px;font-size:12px;font-weight:bold">This order contains ${items.length} items — check ALL are in the parcel</div>`:''}<table><tr><th>Item</th><th>Quantity</th><th>Item price</th><th>VAT rate</th><th>Item total</th></tr>${itemRows}</table>${sharedDetails}<div class="totals"><strong>Subtotal (excl. VAT)</strong> ${currency} ${fmt(subtotal)}<br/><strong>Postage (excl. VAT)</strong> ${currency} ${fmt(postage)}<br/><strong>VAT amount</strong> ${currency} 0.00<br/><strong><b>Order total</b></strong> <b>${currency} ${fmt(orderTotal)}</b></div><div class="message"><strong>A message from DSA Auto Seat Factory AB</strong><br/>Thanks for your purchase! I hope you love it!</div><div style="clear:both"></div><br/><button onclick="window.print()">Print</button></body></html>`)
  w.document.close()
}
