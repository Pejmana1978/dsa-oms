import { useState } from 'react'
import Btn from '../components/Btn'
import { updateOrder } from '../lib/api'
import { useToast } from '../components/Toast'
import OrderModal from '../components/OrderModal'
import { getOrderItems, itemThumb } from '../lib/orderItems'
import { OVERDUE_DAYS, daysWaiting, isOverdue, isUsTeamOrder } from '../lib/usOrders'

// Safeguard view: US/Canada website orders handed to the US team (Juan) for
// fulfilment in ShipStation. Nothing here is produced or shipped by us — the
// page exists so an unshipped order can never quietly disappear.
export default function UsOrdersPage({ orders, setOrders, role }) {
  const [selected, setSelected] = useState(null)
  const [showShipped, setShowShipped] = useState(false)
  const [busy, setBusy] = useState({})
  const toast = useToast()

  const all = orders.filter(o => isUsTeamOrder(o) && !o.archived)
  const open = all.filter(o => o.us_status !== 'shipped')
  const list = (showShipped ? all : open)
    .slice()
    .sort((a, b) => daysWaiting(b) - daysWaiting(a))
  const overdue = open.filter(o => isOverdue(o))

  async function setStatus(o, status) {
    setBusy(prev => ({ ...prev, [o.id]: true }))
    try {
      const patch = { us_status: status }
      if (status === 'sent') patch.us_sent_at = new Date().toISOString()
      if (status === 'shipped') patch.us_shipped_at = new Date().toISOString()
      if (status === 'received') { patch.us_sent_at = null; patch.us_shipped_at = null }
      const updated = await updateOrder(o.id, patch)
      setOrders(prev => prev.map(x => x.id === o.id ? updated : x))
      toast(o.order_ref + ' → ' + (status === 'sent' ? 'sent to Juan' : status === 'shipped' ? 'shipped' : 'received'))
    } catch (e) { toast(e.message, 'error') }
    setBusy(prev => ({ ...prev, [o.id]: false }))
  }

  async function saveTracking(o, tracking) {
    if (!tracking || tracking === (o.tracking_number || '')) return
    try {
      const updated = await updateOrder(o.id, { tracking_number: tracking })
      setOrders(prev => prev.map(x => x.id === o.id ? updated : x))
      toast('Tracking saved')
    } catch (e) { toast(e.message, 'error') }
  }

  function handleUpdated(updated) {
    setOrders(prev => prev.map(x => x.id === updated.id ? updated : x))
    setSelected(null)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 12, color: '#888' }}>
          {open.length} order{open.length !== 1 ? 's' : ''} with the US team
          {overdue.length > 0 && <strong style={{ color: '#E24B4A' }}> · {overdue.length} overdue ({OVERDUE_DAYS}+ days)</strong>}
        </span>
        <label style={{ fontSize: 12, color: '#888', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" style={{ width: 16, height: 16 }} checked={showShipped} onChange={e => setShowShipped(e.target.checked)} />
          Show shipped
        </label>
      </div>

      {overdue.length > 0 && (
        <div style={{ background: '#FDECEC', border: '1px solid #E24B4A', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#A32D2D', fontWeight: 600 }}>
          ⚠ {overdue.length} order{overdue.length !== 1 ? 's have' : ' has'} been waiting {OVERDUE_DAYS} days or more — check with Juan that {overdue.length !== 1 ? 'they were' : 'it was'} shipped.
        </div>
      )}

      {list.length === 0 && (
        <div style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, padding: 32, textAlign: 'center', fontSize: 12, color: '#bbb' }}>
          Nothing waiting on the US team 🎉
        </div>
      )}

      {list.map(o => {
        const days = daysWaiting(o)
        const late = o.us_status !== 'shipped' && isOverdue(o)
        const status = o.us_status || 'received'
        const items = getOrderItems(o)
        return (
          <div key={o.id} style={{
            background: late ? '#FFF7F7' : '#fff',
            border: late ? '2px solid #E24B4A' : '1px solid #e0ddd8',
            borderRadius: 10, padding: '13px 15px', marginBottom: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ cursor: 'pointer', minWidth: 220 }} onClick={() => setSelected(o)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{o.order_ref}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 7px',
                    background: status === 'shipped' ? '#D4EDDA' : status === 'sent' ? '#E6F1FB' : '#F1EFE8',
                    color: status === 'shipped' ? '#155724' : status === 'sent' ? '#0C447C' : '#5F5E5A'
                  }}>
                    {status === 'shipped' ? '✓ Shipped' : status === 'sent' ? 'Sent to Juan' : 'Received'}
                  </span>
                  {o.us_status !== 'shipped' && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: late ? '#E24B4A' : '#888' }}>
                      {days} day{days !== 1 ? 's' : ''} waiting
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{o.customer_name} — {o.address}</div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                  {items.map((it, i) => (
                    <div key={i}>{(Number(it.quantity) || 1) > 1 ? it.quantity + '× ' : ''}{it.title || it.car}</div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {items.some(it => itemThumb(it)) && (
                  <img src={itemThumb(items[0])} alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 4, border: '1px solid #e0ddd8' }} />
                )}
                {status === 'received' && (
                  <Btn size="sm" disabled={!!busy[o.id]} onClick={() => setStatus(o, 'sent')}>Mark sent to Juan</Btn>
                )}
                {status !== 'shipped' && (
                  <Btn size="sm" variant="primary" disabled={!!busy[o.id]} onClick={() => setStatus(o, 'shipped')}>Mark shipped</Btn>
                )}
                {status === 'shipped' && (
                  <Btn size="sm" disabled={!!busy[o.id]} onClick={() => setStatus(o, 'sent')}>Undo shipped</Btn>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, color: '#888' }}>Tracking (optional)</label>
              <input
                defaultValue={o.tracking_number || ''}
                placeholder="paste tracking from Juan"
                onBlur={e => saveTracking(o, e.target.value.trim())}
                style={{ width: 220, fontSize: 12 }}
              />
              {o.tracking_number && (
                <a href={'https://www.ups.com/track?tracknum=' + o.tracking_number} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#185FA5', textDecoration: 'none' }}>track →</a>
              )}
              {o.us_sent_at && <span style={{ fontSize: 10, color: '#aaa' }}>sent {o.us_sent_at.slice(0, 10)}</span>}
              {o.us_shipped_at && <span style={{ fontSize: 10, color: '#27a069' }}>shipped {o.us_shipped_at.slice(0, 10)}</span>}
            </div>
          </div>
        )
      })}

      {selected && <OrderModal order={selected} role={role} onClose={() => setSelected(null)} onUpdated={handleUpdated} />}
    </>
  )
}
