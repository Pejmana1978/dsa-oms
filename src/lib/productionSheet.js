// Single source of truth for the printed production sheet. Used by both the
// Production page (single / print-all) and the Verified page (batch print).
// Renders one full-spec block PER item — each line item is its own job.
import { getOrderItems } from './orderItems'

export function buildSheetHTML(o) {
  const items = getOrderItems(o)
  const multi = items.length > 1
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const customerPhotos = (o.photos || []).filter(p => p.url && ['jpg','jpeg','png','gif','webp'].includes((p.name||'').split('.').pop().toLowerCase()))
  const photosRow = customerPhotos.length > 0
    ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid #eee">' +
      customerPhotos.map(p => '<img src="' + p.url + '" style="height:120px;max-width:160px;object-fit:contain;border-radius:4px;border:1px solid #ddd;background:#f9f9f9" loading="lazy"  />').join('') + '</div>' : ''
  const orderNote = o.notes ? '<div style="font-size:11px;background:#FFFBEB;border:1px solid #F59E0B;border-radius:4px;padding:3px 7px;margin-top:8px;display:inline-block">' + esc(o.notes) + '</div>' : ''
  const bigThumb = (t) => t
    ? '<img src="' + t.replace('s-l1600', 's-l500') + '" style="width:150px;height:130px;object-fit:contain;border-radius:4px;border:1px solid #ddd;background:#f9f9f9;display:block" />'
    : '<div style="width:150px;height:130px;border:1px dashed #ccc;border-radius:4px;background:#f7f7f7"></div>'

  const itemBlock = (it, i) => {
    const positions = (it.position || []).concat(it.position_other ? [it.position_other] : [])
    const posStr = positions.join(' & ') || '—'
    const isMultiPos = positions.length > 1
    const thumb = it.custom_thumbnail || it.thumbnail || ''
    const spec =
      '<div style="font-size:15px;font-weight:bold;color:' + (isMultiPos ? '#d97706' : '#000') + '">' + esc(posStr) + '</div>' +
      '<div style="font-size:13px;margin-top:3px">' + esc(it.material || '—') + '</div>' +
      '<div style="font-size:13px;color:#333">' + esc(it.color || '—') + '</div>'
    const meta =
      (it.vin ? '<div style="font-size:10px;font-family:monospace;color:#555;margin-bottom:4px">VIN: ' + esc(it.vin) + '</div>' : '') +
      (it.year ? '<div style="font-size:11px;color:#555;margin-bottom:6px">Year: ' + esc(it.year) + '</div>' : '') +
      (it.item_notes ? '<div style="font-size:11px;background:#FFFBEB;border:1px solid #F59E0B;border-radius:4px;padding:3px 7px;margin-top:4px;display:inline-block">' + esc(it.item_notes) + '</div>' : '')
    return '<table style="width:100%;border-collapse:collapse;' + (multi && i > 0 ? 'border-top:1px dashed #bbb;' : '') + '"><tr>' +
      '<td style="width:26%;vertical-align:top;padding:8px 10px 8px 0"><div style="font-size:15px;font-weight:bold;line-height:1.3">' + esc(it.car || it.title || '—') + '</div>' +
        (multi ? '<div style="font-size:10px;color:#888;margin-top:2px">Item ' + (i + 1) + ' of ' + items.length + (it.sku ? ' · SKU ' + esc(it.sku) : '') + '</div>' : '') + '</td>' +
      '<td style="width:26%;vertical-align:top;padding:8px 10px">' + spec + '</td>' +
      '<td style="width:8%;vertical-align:top;text-align:center;padding-top:8px"><div style="font-size:44px;font-weight:bold;line-height:1">' + (it.quantity || 1) + '</div><div style="font-size:9px;color:#888">QTY</div></td>' +
      '<td style="width:18%;vertical-align:top;padding:8px 10px">' + bigThumb(thumb) + '</td>' +
      '<td style="width:22%;vertical-align:top;padding-top:8px">' + meta + '</td>' +
      '</tr></table>'
  }

  const border = multi ? '2px solid #d97706' : '1px solid #ccc'
  const banner = multi ? '<div style="background:#FFFBEB;border:1px solid #F59E0B;border-radius:4px;padding:5px 10px;margin-bottom:8px;font-size:13px;font-weight:bold;color:#92400E">⚠ MULTI-ITEM ORDER — ' + items.length + ' ITEMS, produce ALL of them</div>' : ''
  return '<div style="border:' + border + ';border-radius:6px;padding:14px;margin-bottom:16px;page-break-inside:avoid">' +
    banner +
    '<div style="font-size:11px;color:#666;margin-bottom:6px">Order: ' + esc(o.order_ref) + '</div>' +
    items.map(itemBlock).join('') +
    orderNote +
    photosRow +
    '</div>'
}
