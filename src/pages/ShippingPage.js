import { useState } from 'react'
import { StageBadge } from '../components/Badges'
import Btn from '../components/Btn'
import { STAGES } from '../lib/constants'
import { updateOrder } from '../lib/api'
import { useToast } from '../components/Toast'
import OrderModal from '../components/OrderModal'

export default function ShippingPage({ orders, setOrders, role }) {
  const [selected, setSelected] = useState(null)
  const toast = useToast()

  const ship = orders.filter(o => ['Production completed', 'Packed', 'Shipped'].includes(o.stage))

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

  function printLabel(o) {
    const w = window.open('', '_blank')
    w.document.write(`
      <html><head><title>Shipping Label ${o.order_ref}</title>
      <style>
        body{font-family:sans-serif;padding:32px;font-size:13px}
        .label{border:2px solid #333;padding:24px;max-width:360px;border-radius:8px}
        h2{margin-bottom:14px;font-size:16px}
        .row{display:flex;gap:12px;margin-bottom:6px}
        .key{color:#888;min-width:70px}
        .contents{border:1px solid #ccc;padding:12px;border-radius:6px;margin-top:14px;background:#f9f9f9}
        .barcode{font-family:monospace;font-size:16px;letter-spacing:4px;text-align:center;padding:10px;border:1px solid #ccc;border-radius:4px;margin-top:12px}
        @media print{button{display:none}}
      </style></head><body>
      <div class="label">
        <h2>Shipping Label — ${o.order_ref}</h2>
        <div class="row"><span class="key">To</span><strong>${o.customer_name}</strong></div>
        <div class="row"><span class="key">Email</span><span>${o.email || '—'}</span></div>
        <div class="row"><span class="key">Phone</span><span>${o.phone || '—'}</span></div>
        <div class="contents">
          <strong>${o.seats} seat covers — ${o.color}</strong><br/>
          <span style="color:#888;font-size:11px">${o.car}</span>
        </div>
        <div class="barcode">${o.order_ref}</div>
      </div>
      <br/><button onclick="window.print()">Print label</button>
      </body></html>`)
    w.document.close()
  }

  function handleUpdated(updated) {
    setOrders(prev => prev.map(x => x.id === updated.id ? updated : x))
    setSelected(null)
  }

  return (
    <>
      {ship.length === 0 && (
        <div style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, padding: 32, textAlign: 'center', fontSize: 12, color: '#bbb' }}>
          No orders ready for shipping yet
        </div>
      )}

      {ship.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: '#f9f9f8' }}>
                {['ID', 'Customer', 'Product', 'Status', 'Actions'].map((h, i) => (
                  <th key={h} style={{ padding: '8px 11px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#888', borderBottom: '1px solid #e0ddd8', width: [80, 150, 200, 110, 140][i] }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ship.map(o => (
                <tr key={o.id} onClick={() => setSelected(o)} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafaf9'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '9px 11px', fontSize: 11, fontWeight: 600, color: '#185FA5' }}>{o.order_ref}</td>
                  <td style={{ padding: '9px 11px' }}>
                    <div style={{ fontSize: 12 }}>{o.customer_name}</div>
                    <div style={{ fontSize: 10, color: '#aaa' }}>{o.email}</div>
                  </td>
                  <td style={{ padding: '9px 11px' }}>
                    <div style={{ fontSize: 12 }}>{o.car}</div>
                    <div style={{ fontSize: 10, color: '#aaa' }}>{o.seats} · {o.color}</div>
                  </td>
                  <td style={{ padding: '9px 11px' }}><StageBadge stage={o.stage} /></td>
                  <td style={{ padding: '9px 11px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <Btn size="sm" onClick={() => printLabel(o)}>Print label</Btn>
                      <Btn size="sm" variant="success" onClick={() => advance(o.id)}>Advance</Btn>
                    </div>
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
