import { useState, useMemo } from 'react'
import { StageBadge, SourceBadge } from '../components/Badges'
import Btn from '../components/Btn'
import { STAGES } from '../lib/constants'
import { updateOrder, deleteOrder } from '../lib/api'
import { useToast } from '../components/Toast'
import OrderModal from '../components/OrderModal'
import NewOrderModal from '../components/NewOrderModal'
import { supabase } from '../lib/supabase'

export default function OrdersPage({ orders, setOrders, role }) {
  const [q, setQ] = useState('')
  const [srcFilter, setSrcFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('All')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const toast = useToast()
  async function syncEbay() {
  setSyncing(true)
  try {
    const res = await fetch('/api/ebay-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    toast('Imported ' + data.imported + ' new eBay order' + (data.imported !== 1 ? 's' : ''))
    if (data.imported > 0) window.location.reload()
  } catch (e) { toast(e.message || 'Sync failed', 'error') }
  setSyncing(false)
}

  const stageCounts = useMemo(() => {
    const c = { All: orders.length }
    STAGES.forEach(s => { c[s] = orders.filter(o => o.stage === s).length })
    return c
  }, [orders])

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (stageFilter !== 'All' && o.stage !== stageFilter) return false
      if (srcFilter && o.source !== srcFilter) return false
      if (q) {
        const qs = q.toLowerCase()
        if (!`${o.order_ref}${o.customer_name}${o.vin || ''}${o.car}`.toLowerCase().includes(qs)) return false
      }
      return true
    })
  }, [orders, stageFilter, srcFilter, q])

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

  async function handleDelete(id, ref) {
    if (!window.confirm(`Delete order ${ref}?`)) return
    try {
      await deleteOrder(id)
      setOrders(prev => prev.filter(x => x.id !== id))
      toast('Order deleted')
    } catch (e) { toast(e.message, 'error') }
  }

  function handleUpdated(updated) {
    setOrders(prev => prev.map(x => x.id === updated.id ? updated : x))
    setSelectedOrder(null)
  }

  function handleCreated(order) {
    setOrders(prev => [order, ...prev])
  }

  const canCreate = role === 'admin' || role === 'sales'

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, order ID, VIN, car…" style={{ flex: 1, minWidth: 160 }} />
        <select value={srcFilter} onChange={e => setSrcFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All sources</option>
          {['Shopify', 'eBay', 'Manual'].map(s => <option key={s}>{s}</option>)}
        </select>
        {canCreate && <Btn variant="primary" onClick={() => setShowNew(true)}>+ New order</Btn>}
{canCreate && <Btn variant="default" onClick={syncEbay} disabled={syncing}>{syncing ? 'Syncing eBay…' : 'Sync eBay orders'}</Btn>}
      </div>

      {/* Stage tabs */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 12, flexWrap: 'wrap' }}>
        {['All', ...STAGES].map(s => (
          <div key={s} onClick={() => setStageFilter(s)} style={{
            padding: '4px 11px', borderRadius: 20, border: '1px solid',
            fontSize: 11, cursor: 'pointer',
            borderColor: stageFilter === s ? '#185FA5' : '#e0ddd8',
            color: stageFilter === s ? '#185FA5' : '#888',
            background: stageFilter === s ? '#E6F1FB' : '#fff',
          }}>{s} <span style={{ opacity: .6 }}>{stageCounts[s] || 0}</span></div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: '#f9f9f8' }}>
              {['ID', 'Customer', 'Source', '', 'Product', 'Status', 'Date', 'Actions'].map((h, i) => (
                <th key={h} style={{ padding: '8px 11px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#888', borderBottom: '1px solid #e0ddd8', width: [80, 130, 70, 48, 160, 95, 70, 110][i] }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 28, textAlign: 'center', color: '#bbb', fontSize: 12 }}>No orders found</td></tr>
            )}
            {filtered.map(o => (
              <tr key={o.id} onClick={() => setSelectedOrder(o)} style={{ cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#fafaf9'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: '9px 11px', fontSize: 11, fontWeight: 600, color: '#185FA5' }}>{o.order_ref}</td>
                <td style={{ padding: '9px 11px' }}>
                  <div style={{ fontSize: 12 }}>{o.customer_name}</div>
                  <div style={{ fontSize: 10, color: '#aaa' }}>{o.phone}</div>
                </td>
                <td style={{ padding: '9px 11px' }}><SourceBadge source={o.source} /></td>
                <td style={{ padding: '4px 6px' }}>{o.thumbnail ? <img src={o.thumbnail} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} /> : <div style={{ width: 36, height: 36, borderRadius: 4, background: '#f0ede8' }} />}</td>
                <td style={{ padding: '9px 11px' }}>
                  <div style={{ fontSize: 12 }}>{o.car}</div>
                  <div style={{ fontSize: 10, color: '#aaa' }}>{o.seats} · {o.color}</div>
                </td>
                <td style={{ padding: '9px 11px' }}><StageBadge stage={o.stage} /></td>
                <td style={{ padding: '9px 11px', fontSize: 11, color: '#aaa' }}>{o.order_date ? o.order_date.slice(0, 10).split('-').reverse().join('/') : '—'}</td>
                <td style={{ padding: '9px 11px' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Btn size="sm" onClick={() => advance(o.id)}>Advance</Btn>
                    {role === 'admin' && <Btn size="sm" variant="danger" onClick={() => handleDelete(o.id, o.order_ref)}>✕</Btn>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <OrderModal
          order={selectedOrder}
          role={role}
          onClose={() => setSelectedOrder(null)}
          onUpdated={handleUpdated}
        />
      )}
      {showNew && <NewOrderModal onClose={() => setShowNew(false)} onCreated={handleCreated} />}
    </>
  )
}
