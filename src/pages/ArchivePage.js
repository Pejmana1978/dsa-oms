import { useState, useMemo } from 'react'
import OrderModal from '../components/OrderModal'
import { getOrderItems } from '../lib/orderItems'

export default function ArchivePage({ orders, setOrders, role }) {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)

  const archived = useMemo(() => {
    return orders.filter(o => {
      if (!o.archived) return false
      if (q) {
        const qs = q.toLowerCase()
        const hay = [o.order_ref, o.customer_name, o.car, o.vin, o.notes,
          ...getOrderItems(o).flatMap(it => [it.title, it.car, it.vin, it.sku, it.color])]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(qs)) return false
      }
      return true
    })
  }, [orders, q])

  async function handleUnarchive(id, ref) {
    try {
      const { updateOrder } = await import('../lib/api')
      const updated = await updateOrder(id, { archived: false })
      setOrders(prev => prev.map(x => x.id === id ? updated : x))
    } catch (e) { alert(e.message) }
  }

  function handleUpdated(updated) {
    setOrders(prev => prev.map(x => x.id === updated.id ? updated : x))
    setSelected(null)
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search archived orders..." style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#aaa' }}>{archived.length} order{archived.length !== 1 ? 's' : ''}</span>
      </div>
      {archived.length === 0 && (
        <div style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, padding: 32, textAlign: 'center', fontSize: 12, color: '#bbb' }}>
          {q ? 'No archived orders match your search' : 'No archived orders yet'}
        </div>
      )}
      {archived.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: '#f9f9f8' }}>
                {['ID', 'Customer', 'Product', 'Color / Trim', 'Delivered', 'Tracking', ''].map((h, i) => (
                  <th key={h} style={{ padding: '8px 11px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#888', borderBottom: '1px solid #e0ddd8', width: [110, 140, 200, 120, 80, 130][i] }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {archived.map(o => (
                <tr key={o.id} onClick={() => setSelected(o)} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafaf9'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '9px 11px', fontSize: 11, fontWeight: 600, color: '#185FA5' }}>{o.order_ref}</td>
                  <td style={{ padding: '9px 11px' }}>
                    <div style={{ fontSize: 12 }}>{o.customer_name}</div>
                    <div style={{ fontSize: 10, color: '#aaa' }}>{o.phone}</div>
                  </td>
                  <td style={{ padding: '9px 11px' }}>
                    {(() => {
                      const its = getOrderItems(o)
                      return <>
                        <div style={{ fontSize: 12 }}>{its[0].car || its[0].title || o.car}</div>
                        {its.length > 1
                          ? <div style={{ fontSize: 10, fontWeight: 700, color: '#d97706' }}>⚠ {its.length} items in this order</div>
                          : <div style={{ fontSize: 10, color: '#aaa' }}>{(its[0].position || []).join(', ')}</div>}
                      </>
                    })()}
                  </td>
                  <td style={{ padding: '9px 11px', fontSize: 12 }}>{getOrderItems(o).map(it => it.color).filter(Boolean).join(' / ') || '—'}</td>
                  <td style={{ padding: '9px 11px', fontSize: 11, color: '#27a069' }}>
                    {o.delivered_at ? o.delivered_at.slice(0,10).split('-').reverse().join('/') : '—'}
                  </td>
                  <td style={{ padding: '9px 11px' }}>
                    {o.tracking_number
                      ? <a href={'https://www.ups.com/track?tracknum=' + o.tracking_number} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#185FA5', textDecoration: 'none' }}>📦 {o.tracking_number}</a>
                      : <span style={{ fontSize: 11, color: '#aaa' }}>—</span>}
                  </td>
                  <td style={{ padding: '9px 11px' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleUnarchive(o.id, o.order_ref)} style={{ fontSize: 11, color: '#888', background: 'none', border: '1px solid #e0ddd8', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>Unarchive</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <OrderModal order={selected} role={role} onClose={() => setSelected(null)} onUpdated={handleUpdated} />
      )}
    </>
  )
}
