import { useState } from 'react'
import { StageBadge } from '../components/Badges'
import Btn from '../components/Btn'
import { STAGES } from '../lib/constants'
import { updateOrder } from '../lib/api'
import { useToast } from '../components/Toast'
import OrderModal from '../components/OrderModal'

export default function ProductionPage({ orders, setOrders, role }) {
  const [selected, setSelected] = useState(null)
  const toast = useToast()

  const prod = orders.filter(o => ['Verified', 'In production', 'Production completed'].includes(o.stage))

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
    w.document.write(`
      <html><head><title>Production Sheet ${o.order_ref}</title>
      <style>body{font-family:sans-serif;padding:32px;font-size:13px;line-height:2}h2{margin-bottom:12px}td:first-child{color:#888;min-width:140px;padding-right:16px}table{border-collapse:collapse}@media print{button{display:none}}</style>
      </head><body>
      <h2>Production Sheet — ${o.order_ref}</h2>
      <table>
        <tr><td>Order ID</td><td>${o.order_ref}</td></tr>
        <tr><td>Customer</td><td>${o.customer_name}</td></tr>
        <tr><td>Phone</td><td>${o.phone || '—'}</td></tr>
        <tr><td>Car</td><td>${o.car}</td></tr>
        <tr><td>VIN</td><td style="font-family:monospace">${o.vin || '—'}</td></tr>
        <tr><td>Seats</td><td>${o.seats}</td></tr>
        <tr><td>Color / material</td><td>${o.color}</td></tr>
        <tr><td>Notes</td><td>${o.notes || '—'}</td></tr>
        <tr><td>Status</td><td>${o.stage}</td></tr>
      </table>
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
          <tr><td>Customer</td><td>${o.customer_name}</td></tr>
          <tr><td>Car</td><td>${o.car}</td></tr>
          <tr><td>VIN</td><td style="font-family:monospace">${o.vin || '—'}</td></tr>
          <tr><td>Seats</td><td>${o.seats}</td></tr>
          <tr><td>Color / material</td><td>${o.color}</td></tr>
          <tr><td>Notes</td><td>${o.notes || '—'}</td></tr>
          <tr><td>Status</td><td>${o.stage}</td></tr>
        </table>
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
              <div style={{ fontSize: 13, fontWeight: 600 }}>{o.order_ref} — {o.car}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{o.customer_name}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <StageBadge stage={o.stage} />
              <Btn size="sm" onClick={() => advance(o.id)}>Advance</Btn>
              <Btn size="sm" onClick={() => printSheet(o)}>Print sheet</Btn>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[['Seats', o.seats], ['Color / material', o.color], ['VIN', o.vin || '—']].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 12, fontWeight: 600, fontFamily: k === 'VIN' ? 'monospace' : undefined }}>{v}</div>
              </div>
            ))}
            {o.notes && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>Notes</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{o.notes}</div>
              </div>
            )}
          </div>
        </div>
      ))}

      {selected && (
        <OrderModal order={selected} role={role} onClose={() => setSelected(null)} onUpdated={handleUpdated} />
      )}
    </>
  )
}
