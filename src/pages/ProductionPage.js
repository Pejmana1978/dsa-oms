import { useState, useEffect } from 'react'
import Btn from '../components/Btn'
import { STAGES } from '../lib/constants'
import { updateOrder } from '../lib/api'
import { useToast } from '../components/Toast'
import OrderModal from '../components/OrderModal'
import { getOrderItems, isMultiItem, itemThumb } from '../lib/orderItems'
import { buildSheetHTML } from '../lib/productionSheet'

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
    if (!w) { toast('Popup blocked — allow popups for this site to print', 'error'); return }
    w.document.write('<html><head><title>Production Sheet</title><style>* { box-sizing: border-box; } body { font-family: Arial, sans-serif; padding: 24px; font-size: 13px; } @media print { button { display: none } }</style></head><body>' + buildSheetHTML(o) + '<button onclick="window.print()" style="margin-top:16px">Print</button></body></html>')
    w.document.close()
  }



  function printAll() {
    if (!prod.length) { toast('No production orders'); return }
    const w = window.open('', '_blank')
    if (!w) { toast('Popup blocked — allow popups for this site to print', 'error'); return }
    const sheetsHTML = prod.map(o => buildSheetHTML(o)).join('')
    w.document.write('<html><head><title>All Production Sheets</title><style>* { box-sizing: border-box; } body { font-family: Arial, sans-serif; padding: 24px; font-size: 13px; } @media print { button { display: none } }</style></head><body>' + sheetsHTML + '<button onclick="window.print()">Print all</button></body></html>')
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
              <div style={{ fontSize: 13, fontWeight: 600 }}>{o.order_ref}{isMultiItem(o) ? <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706', marginLeft: 8 }}>⚠ {o.items.length} items</span> : null}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{getOrderItems(o)[0].car || o.car} — {o.stage}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <Btn size="sm" onClick={() => advance(o.id)}>Advance</Btn>
              <Btn size="sm" onClick={() => printSheet(o)}>Print sheet</Btn>

            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
            {getOrderItems(o).map((it, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 0.5fr', gap: 10, borderTop: i > 0 ? '1px dashed #e0ddd8' : 'none', paddingTop: i > 0 ? 8 : 0 }}>
                {[
                  ['Car / position', `${it.car || it.title || '—'}${(it.position || []).length ? ' · ' + (it.position || []).join(', ') : ''}`],
                  ['Material', it.material || '—'],
                  ['Color / Trim', it.color || '—'],
                  ['VIN', it.vin || '—'],
                  ['Qty', it.quantity || 1],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, fontFamily: k === 'VIN' ? 'monospace' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</div>
                  </div>
                ))}
              </div>
            ))}
            {o.notes && (
              <div>
                <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>Notes</div>
                <div style={{ fontSize: 12 }}>{o.notes}</div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {getOrderItems(o).some(it => itemThumb(it)) && (
              <div>
                <div style={{ fontSize: 10, color: '#aaa', marginBottom: 3 }}>{isMultiItem(o) ? `eBay listings (${o.items.length} items)` : 'eBay listing'}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {getOrderItems(o).map((it, i) => itemThumb(it) && (
                    <img key={i} src={itemThumb(it)} alt="eBay" title={it.title} style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 4, border: '1px solid #e0ddd8' }} />
                  ))}
                </div>
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
