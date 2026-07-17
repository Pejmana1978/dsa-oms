import { useState } from 'react'
import { StageBadge } from '../components/Badges'
import Btn from '../components/Btn'
import { updateOrder } from '../lib/api'
import { useToast } from '../components/Toast'
import OrderModal from '../components/OrderModal'
import { getOrderItems, isMultiItem } from '../lib/orderItems'

export default function ShippingUSPage({ orders, setOrders, role }) {
  const [selected, setSelected] = useState(null)
  const toast = useToast()

  const queue = orders.filter(o => o.stage === 'Production Complete')

  async function advance(id) {
    const o = orders.find(x => x.id === id)
    if (!o) return
    try {
      const updated = await updateOrder(id, { stage: 'Shipped to Sweden' })
      setOrders(prev => prev.map(x => x.id === id ? updated : x))
      toast(o.order_ref + ' → Shipped to Sweden')
    } catch (e) { toast(e.message, 'error') }
  }

  function handleUpdated(updated) {
    setOrders(prev => prev.map(x => x.id === updated.id ? updated : x))
    setSelected(null)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#888' }}>{queue.length} order{queue.length !== 1 ? 's' : ''} ready to ship from USA</span>
      </div>
      {queue.length === 0 && (
        <div style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, padding: 32, textAlign: 'center', fontSize: 12, color: '#bbb' }}>
          No orders ready to ship from USA
        </div>
      )}
      {queue.map(o => (
        <div key={o.id} style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, padding: '13px 15px', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ cursor: 'pointer' }} onClick={() => setSelected(o)}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{o.order_ref}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{o.stage}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <StageBadge stage={o.stage} />
              <Btn size="sm" variant="primary" onClick={() => advance(o.id)}>Mark Shipped</Btn>
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {getOrderItems(o).some(it => it.thumbnail) && (
              <div>
                <div style={{ fontSize: 10, color: '#aaa', marginBottom: 3 }}>{isMultiItem(o) ? `eBay listings (${o.items.length} items)` : 'eBay listing'}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {getOrderItems(o).map((it, i) => it.thumbnail && (
                    <img key={i} src={it.thumbnail} alt="eBay" title={it.title} style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 4, border: '1px solid #e0ddd8' }} />
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
          </div>
        </div>
      ))}
      {selected && <OrderModal order={selected} role={role} onClose={() => setSelected(null)} onUpdated={handleUpdated} />}
    </>
  )
}
