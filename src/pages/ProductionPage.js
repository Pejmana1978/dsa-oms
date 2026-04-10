import { useState, useEffect } from 'react'
import { StageBadge } from '../components/Badges'
import Btn from '../components/Btn'
import { STAGES } from '../lib/constants'
import { updateOrder } from '../lib/api'
import { useToast } from '../components/Toast'
import OrderModal from '../components/OrderModal'

export default function ProductionPage({ orders, setOrders, role }) {
  const [selected, setSelected] = useState(null)
  const [lightbox, setLightbox] = useState({ photos: [], idx: 0 })
  const [showLightbox, setShowLightbox] = useState(false)
  const toast = useToast()

  useEffect(() => {
    function handleKey(e) {
      if (!showLightbox) return
      if (e.key === 'Escape') setShowLightbox(false)
      if (e.key === 'ArrowRight') setLightbox(prev => ({ ...prev, idx: Math.min(prev.idx + 1, prev.photos.length - 1) }))
      if (e.key === 'ArrowLeft') setLightbox(prev => ({ ...prev, idx: Math.max(prev.idx - 1, 0) }))
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showLightbox])

  const prod = orders.filter(o => ['Verified', 'In Production', 'Production Complete'].includes(o.stage))

  async function advance(id) {
    const o = orders.find(x => x.id === id)
    if (!o) return
    const idx = STAGES.indexOf(o.stage)
    if (idx >= STAGES.length - 1) return
    const newStage = STAGES[idx + 1]
    try {
      const updated = await updateOrder(id, { stage: newStage })
      setOrders(prev => prev.map(x => x.id === id ? updated : x))
      toast(`${o.order_ref} → "${newStage}"`)
    } catch (e) { toast(e.message, 'error') }
  }

  function printSheet(o) {
    const w = window.open('', '_blank')
    const photos = (o.photos || []).filter(p => p.url).map(p => `<img src="${p.url}" style="max-width:180px;max-height:180px;border-radius:6px;border:1px solid #ddd" />`).join('')
    w.document.write(`
      <html><head><title>Production Sheet</title>
      <style>body{font-family:sans-serif;padding:32px;font-size:14px;line-height:2}h2{margin-bottom:12px}td:first-child{color:#888;min-width:140px;padding-right:16px}table{border-collapse:collapse}.photos{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}@media print{button{display:none}}</style>
      </head><body>
      <h2>Production Sheet</h2>
      <table>
        <tr><td>Car</td><td><strong>${o.car}</strong></td></tr>
        <tr><td>VIN</td><td style="font-family:monospace"><strong>${o.vin || '—'}</strong></td></tr>
        <tr><td>Position</td><td><strong>${(o.position || []).join(', ') || '—'}</strong></td></tr>
        <tr><td>Material</td><td><strong>${o.material || '—'}</strong></td></tr>
        <tr><td>Color / Trim</td><td><strong>${o.color || '—'}</strong></td></tr>
        <tr><td>Quantity</td><td><strong>${o.quantity || 1}</strong></td></tr>
        <tr><td>Notes</td><td>${o.notes || '—'}</td></tr>
        <tr><td>Status</td><td>${o.stage}</td></tr>
      </table>
      ${photos ? `<div class="photos">${photos}</div>` : ''}
      <br/><button onclick="window.print()">Print</button>
      </body></html>`)
    w.document.close()
  }

  function _unused_printPackingSlip(o) {
    const notes = o.notes || ''
    const priceMatch = notes.match(/Price:\s*([\d.]+)\s*(\w+)/)
    const price = priceMatch ? priceMatch[1] : '—'
    const currency = priceMatch ? priceMatch[2] : ''
    const w = window.open('', '_blank')
    w.document.write(`
      <html><head><title>Packing Slip ${o.order_ref}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; font-size: 13px; color: #000; }
        h1 { text-align: center; font-size: 18px; margin: 0; }
        .subtitle { text-align: center; font-size: 12px; color: #555; margin-bottom: 20px; }
        .header-right { position: absolute; top: 32px; right: 32px; font-size: 13px; font-weight: bold; }
        .addresses { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px; }
        .address-box { font-size: 12px; line-height: 1.6; }
        .address-box strong { display: block; margin-bottom: 4px; }
        .contact { font-size: 12px; margin-bottom: 16px; color: #333; }
        .order-id { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
        .order-date { font-size: 13px; float: right; margin-top: -24px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { text-align: left; font-size: 12px; border-bottom: 2px solid #000; padding: 6px 8px; }
        td { padding: 10px 8px; font-size: 12px; border-bottom: 1px solid #ddd; vertical-align: top; }
        .totals { float: right; margin-top: 16px; font-size: 12px; line-height: 2; }
        .totals strong { display: inline-block; min-width: 140px; }
        .message { font-size: 12px; margin-top: 16px; max-width: 240px; }
        .clearfix { clear: both; }
        @media print { button { display: none } }
      </style>
      <body style="position:relative">
      <div class="header-right">INVOICE/PACKING SLIP</div>
      <h1>DSA Seat Factory</h1>
      <div class="subtitle">https://www.ebay.co.uk/str/autoseatfactory</div>
      <div class="addresses">
        <div class="address-box">
          <strong>Post to</strong>
          ${o.customer_name}<br/>
          ${(o.address || '').replace(/,/g, '<br/>')}
        </div>
        <div class="address-box">
          <strong>Post from</strong>
          DSA Auto Seat Factory AB<br/>
          Vasavägen 78<br/>
          Lidingö, Stockholm<br/>
          18141<br/>
          Sweden<br/>
          VAT ID: SE 556861974501
        </div>
        <div class="address-box">
          <strong>Buyer registration address</strong>
          ${o.customer_name}<br/>
          ${(o.address || '').replace(/,/g, '<br/>')}
        </div>
      </div>
      <div class="contact">
        ${o.phone || ''}<br/>
        ${o.email || ''}
      </div>
      <div class="order-id">Order: ${o.order_ref}</div>
      <div class="order-date">Order date: ${o.order_date ? new Date(o.order_date).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : '—'}</div>
      <div style="clear:both"></div>
      <table>
        <tr>
          <th>Item</th>
          <th>Quantity</th>
          <th>Item price</th>
          <th>VAT rate</th>
          <th>Item total</th>
        </tr>
        <tr>
          <td>
            ${o.thumbnail ? `<img src="${o.thumbnail}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:8px"/>` : ''}
            ${o.car}
          </td>
          <td>${o.quantity || 1}</td>
          <td>${currency} ${price}</td>
          <td>0%</td>
          <td>${currency} ${price}</td>
        </tr>
      </table>
      <div class="totals">
        <strong>Subtotal (excl. VAT)</strong> ${currency} ${price}<br/>
        <strong>Postage (excl. VAT)</strong> ${currency} 0.00<br/>
        <strong>VAT amount</strong> ${currency} 0.00<br/>
        <strong><b>Order total</b></strong> <b>${currency} ${price}</b>
      </div>
      <div class="message">
        <strong>A message from DSA Auto Seat Factory AB</strong><br/>
        Thanks for your purchase! I hope you love it!
      </div>
      <div class="clearfix"></div>
      <br/><button onclick="window.print()">Print</button>
      </body></html>`)
    w.document.close()
  }

  function printAll() {
    if (!prod.length) { toast('No production orders'); return }
    const w = window.open('', '_blank')
    w.document.write(`<html><head><title>All Production Sheets</title>
      <style>body{font-family:sans-serif;padding:32px;font-size:13px;line-height:2}.sheet{page-break-after:always;margin-bottom:40px}h2{margin-bottom:12px}td:first-child{color:#888;min-width:140px;padding-right:16px}table{border-collapse:collapse}@media print{button{display:none}}</style>
      </head><body>
      ${prod.map(o => `<div class="sheet">
        <h2>Production Sheet — ${o.order_ref}</h2>
        <table>
          <tr><td>Order ID</td><td>${o.order_ref}</td></tr>
          <tr><td>Car</td><td><strong>${o.car}</strong></td></tr>
          <tr><td>VIN</td><td style="font-family:monospace"><strong>${o.vin || '—'}</strong></td></tr>
          <tr><td>Position</td><td><strong>${(o.position || []).join(', ') || '—'}</strong></td></tr>
          <tr><td>Material</td><td><strong>${o.material || '—'}</strong></td></tr>
          <tr><td>Color / Trim</td><td><strong>${o.color || '—'}</strong></td></tr>
          <tr><td>Quantity</td><td><strong>${o.quantity || 1}</strong></td></tr>
          <tr><td>Notes</td><td>${o.notes || '—'}</td></tr>
          <tr><td>Status</td><td>${o.stage}</td></tr>
        </table>
        ${(o.photos || []).filter(p => p.url && ['jpg','jpeg','png','gif','webp'].includes((p.name||'').split('.').pop().toLowerCase())).length > 0 ? `<div style="margin-top:12px"><div style="color:#888;font-size:11px;margin-bottom:6px">Photos</div><div style="display:flex;gap:8px;flex-wrap:wrap">${(o.photos || []).filter(p => p.url && ['jpg','jpeg','png','gif','webp'].includes((p.name||'').split('.').pop().toLowerCase())).map(p => `<img src="${p.url}" style="width:120px;height:120px;object-fit:cover;border-radius:6px;border:1px solid #e0ddd8"/>`).join('')}</div></div>` : ''}
      </div>`).join('')}
      <button onclick="window.print()">Print all</button>
      </body></html>`)
    w.document.close()
  }

  function handleUpdated(updated) {
    setOrders(prev => prev.map(x => x.id === updated.id ? updated : x))
    setSelected(null)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#888' }}>{prod.length} order{prod.length !== 1 ? 's' : ''} in production pipeline</span>
        <Btn size="sm" onClick={printAll}>Print all sheets</Btn>
      </div>

      {prod.length === 0 && (
        <div style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, padding: 32, textAlign: 'center', fontSize: 12, color: '#bbb' }}>
          No orders currently in production
        </div>
      )}

      {prod.map(o => (
        <div key={o.id} style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, padding: '13px 15px', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ cursor: 'pointer' }} onClick={() => setSelected(o)}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{o.car}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{o.stage}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <StageBadge stage={o.stage} />
              <Btn size="sm" onClick={() => advance(o.id)}>Advance</Btn>
              <Btn size="sm" onClick={() => printSheet(o)}>Print sheet</Btn>

            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
            {[
              ['Car', o.car],
              ['Position', (o.position || []).join(', ') || '—'],
              ['Material', o.material || '—'],
              ['Color / Trim', o.color || '—'],
              ['Quantity', o.quantity || 1],
              ['VIN', o.vin || '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 12, fontWeight: 600, fontFamily: k === 'VIN' ? 'monospace' : undefined }}>{v}</div>
              </div>
            ))}
            {o.notes && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>Notes</div>
                <div style={{ fontSize: 12 }}>{o.notes}</div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {o.thumbnail && (
              <div>
                <div style={{ fontSize: 10, color: '#aaa', marginBottom: 3 }}>eBay listing</div>
                <img src={o.thumbnail} alt="eBay" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 4, border: '1px solid #e0ddd8' }} />
              </div>
            )}
            {(o.photos || []).filter(p => {
              const ext = (p.name || '').split('.').pop().toLowerCase()
              return ['jpg','jpeg','png','gif','webp'].includes(ext) && p.url
            }).length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: '#aaa', marginBottom: 3 }}>Customer photos</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {o.photos.filter(p => {
                    const ext = (p.name || '').split('.').pop().toLowerCase()
                    return ['jpg','jpeg','png','gif','webp'].includes(ext) && p.url
                  }).map((p, i) => {
                    const imgs = o.photos.filter(p => ['jpg','jpeg','png','gif','webp'].includes((p.name||'').split('.').pop().toLowerCase()) && p.url)
                    return (
                      <img key={i} src={p.url} alt="" onClick={e => { e.stopPropagation(); setLightbox({ photos: imgs, idx: i }); setShowLightbox(true) }} style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 4, border: '1px solid #e0ddd8', cursor: 'zoom-in' }} />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {selected && (
        <OrderModal order={selected} role={role} onClose={() => setSelected(null)} onUpdated={handleUpdated} />
      )}
      {showLightbox && lightbox.photos[lightbox.idx] && (
        <div onClick={() => setShowLightbox(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ position: 'absolute', top: 20, right: 24, color: '#fff', fontSize: 28, cursor: 'pointer' }}>✕</div>
          {lightbox.idx > 0 && <div onClick={e => { e.stopPropagation(); setLightbox(prev => ({ ...prev, idx: prev.idx - 1 })) }} style={{ position: 'absolute', left: 24, color: '#fff', fontSize: 48, cursor: 'pointer', userSelect: 'none' }}>‹</div>}
          <img src={lightbox.photos[lightbox.idx].url} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} onClick={e => e.stopPropagation()} />
          {lightbox.idx < lightbox.photos.length - 1 && <div onClick={e => { e.stopPropagation(); setLightbox(prev => ({ ...prev, idx: prev.idx + 1 })) }} style={{ position: 'absolute', right: 24, color: '#fff', fontSize: 48, cursor: 'pointer', userSelect: 'none' }}>›</div>}
          <div style={{ position: 'absolute', bottom: 20, color: '#aaa', fontSize: 12 }}>{lightbox.idx + 1} / {lightbox.photos.length}</div>
        </div>
      )}
    </>
  )
}
