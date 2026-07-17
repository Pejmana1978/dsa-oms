import { useState } from 'react'
import { StageBadge } from '../components/Badges'
import Btn from '../components/Btn'
import { updateOrder } from '../lib/api'
import { printPackingSlip } from '../lib/printPackingSlip'
import { useToast } from '../components/Toast'
import OrderModal from '../components/OrderModal'
import { getOrderItems, isMultiItem, itemThumb } from '../lib/orderItems'

export default function ShippingSwedPage({ orders, setOrders, role }) {
  const [selected, setSelected] = useState(null)
  const [labelLoading, setLabelLoading] = useState({})
  const [deliveryStatus, setDeliveryStatus] = useState({})
  const [showDelivered, setShowDelivered] = useState(false)
  const toast = useToast()

  const queue = orders.filter(o => {
    if (!['Shipped to Sweden', 'Shipped to Customer', 'Delivered'].includes(o.stage)) return false
    if (!showDelivered && o.stage === 'Delivered') return false
    return true
  })

  async function advance(id, newStage) {
    const o = orders.find(x => x.id === id)
    if (!o) return
    try {
      const updated = await updateOrder(id, { stage: newStage })
      setOrders(prev => prev.map(x => x.id === id ? updated : x))
      toast(o.order_ref + ' → ' + newStage)
    } catch (e) { toast(e.message, 'error') }
  }

  function downloadPDF(base64, trackingNumber) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'label-' + trackingNumber + '.pdf'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function upsLabel(o) {
    if (!o.address) { toast('No address on this order', 'error'); return }
    setLabelLoading(prev => ({ ...prev, [o.id]: 'generating' }))
    try {
      const res = await fetch('/api/ups-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: o })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const updated = await updateOrder(o.id, { tracking_number: data.trackingNumber, label_pdf: data.labelBase64 })
      setOrders(prev => prev.map(x => x.id === o.id ? updated : x))
      downloadPDF(data.labelBase64, data.trackingNumber)
      toast('Label created — tracking: ' + data.trackingNumber)
      if (o.source === 'eBay' && o.order_ref) {
        fetch('/api/ebay-tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: o.order_ref, trackingNumber: data.trackingNumber })
        }).catch(() => {})
      }
    } catch(e) { toast(e.message, 'error') }
    setLabelLoading(prev => ({ ...prev, [o.id]: null }))
  }

  async function checkDelivery(o) {
    if (!o.tracking_number) return
    setDeliveryStatus(prev => ({ ...prev, [o.id]: 'checking' }))
    try {
      const res = await fetch('/api/ups-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: o.tracking_number })
      })
      const data = await res.json()
      setDeliveryStatus(prev => ({ ...prev, [o.id]: data.status }))
      if (data.delivered) {
        const updated = await updateOrder(o.id, { delivered_at: new Date().toISOString(), stage: 'Delivered' })
        setOrders(prev => prev.map(x => x.id === o.id ? updated : x))
        toast(o.order_ref + ' marked as delivered')
      }
    } catch (e) {
      setDeliveryStatus(prev => ({ ...prev, [o.id]: 'Error' }))
    }
  }

  function handleUpdated(updated) {
    setOrders(prev => prev.map(x => x.id === updated.id ? updated : x))
    setSelected(null)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#888' }}>{queue.length} order{queue.length !== 1 ? 's' : ''} in Sweden shipping pipeline</span>
        <label style={{ fontSize: 12, color: '#888', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={showDelivered} onChange={e => setShowDelivered(e.target.checked)} />
          Show delivered
        </label>
      </div>
      {queue.length === 0 && (
        <div style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, padding: 32, textAlign: 'center', fontSize: 12, color: '#bbb' }}>
          No orders in Sweden shipping pipeline
        </div>
      )}
      {queue.map(o => (
        <div key={o.id} style={{ background: o.ship_from_stock ? '#FFFBEB' : '#fff', border: o.ship_from_stock ? '1px solid #F59E0B' : '1px solid #e0ddd8', borderRadius: 10, padding: '13px 15px', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ cursor: 'pointer' }} onClick={() => setSelected(o)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{o.order_ref}</span>
                {o.ship_from_stock && (
                  <span style={{ fontSize: 10, fontWeight: 600, background: '#F59E0B', color: '#fff', borderRadius: 4, padding: '2px 7px' }}>
                    📦 From Sweden stock
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{o.customer_name} — {o.address}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <StageBadge stage={o.stage} />
              {o.stage === 'Shipped to Sweden' && (
                <Btn size="sm" onClick={() => o.tracking_number && o.label_pdf ? downloadPDF(o.label_pdf, o.tracking_number) : upsLabel(o)} disabled={!!labelLoading[o.id]}>
                  {labelLoading[o.id] === 'generating' ? 'Generating…' : o.tracking_number ? '🖨 Reprint' : '📦 UPS Label'}
                </Btn>
              )}
              {o.stage === 'Shipped to Sweden' && o.tracking_number && (
                <Btn size="sm" variant="primary" onClick={() => advance(o.id, 'Shipped to Customer')}>Mark Shipped</Btn>
              )}
              <Btn size="sm" onClick={() => printPackingSlip(o)}>Packing slip</Btn>
              {o.stage === 'Shipped to Customer' && !o.delivered_at && (
                <Btn size="sm" onClick={() => checkDelivery(o)} disabled={deliveryStatus[o.id] === 'checking'}>
                  {deliveryStatus[o.id] === 'checking' ? '…' : '🔄 Check delivery'}
                </Btn>
              )}
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
          </div>
          {o.tracking_number && (
            <div style={{ marginBottom: 8 }}>
              <a href={'https://www.ups.com/track?tracknum=' + o.tracking_number} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#185FA5', textDecoration: 'none' }}>📦 {o.tracking_number}</a>
              {o.delivered_at && <span style={{ fontSize: 11, color: '#27a069', marginLeft: 10 }}>✅ Delivered {o.delivered_at.slice(0,10).split('-').reverse().join('/')}</span>}
              {deliveryStatus[o.id] && deliveryStatus[o.id] !== 'checking' && !o.delivered_at && <span style={{ fontSize: 11, color: '#888', marginLeft: 10 }}>{deliveryStatus[o.id]}</span>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
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
                <div style={{ display: 'flex', gap: 6 }}>
                  {o.photos.filter(p => {
                    const ext = (p.name || '').split('.').pop().toLowerCase()
                    return ['jpg','jpeg','png','gif','webp'].includes(ext) && p.url
                  }).map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noreferrer">
                      <img src={p.url} alt="" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 4, border: '1px solid #e0ddd8' }} />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {(o.documents || []).filter(d => d.url).length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: '#aaa', marginBottom: 3 }}>Documents</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(o.documents || []).filter(d => d.url).map((d, i) => (
                    <a key={i} href={d.url} target="_blank" rel="noreferrer"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
                      <div style={{ width: 70, height: 70, border: '1px solid #e0ddd8', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f7f5', fontSize: 28 }}>📄</div>
                      <span style={{ fontSize: 9, color: '#888', maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || 'Document'}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
      {selected && <OrderModal order={selected} role={role} onClose={() => setSelected(null)} onUpdated={handleUpdated} />}
    </>
  )
}
