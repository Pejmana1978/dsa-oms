import { useState } from 'react'
import { StageBadge } from '../components/Badges'
import Btn from '../components/Btn'
import { updateOrder } from '../lib/api'
import { useToast } from '../components/Toast'
import OrderModal from '../components/OrderModal'
import { getOrderItems } from '../lib/orderItems'
import { buildSheetHTML } from '../lib/productionSheet'

export default function VerifiedPage({ orders, setOrders, role }) {
  const [selected, setSelected] = useState(null)
  const [checked, setChecked] = useState({})
  const [moving, setMoving] = useState(false)
  const toast = useToast()

  const verified = orders.filter(o => o.stage === 'Verified' && !o.archived)
  const selectedOrders = verified.filter(o => checked[o.id])
  const allChecked = verified.length > 0 && verified.every(o => checked[o.id])

  function toggleCheck(id) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleAll() {
    const next = {}
    verified.forEach(o => { next[o.id] = !allChecked })
    setChecked(next)
  }

  function batchPrint() {
    if (!selectedOrders.length) { toast('Select at least one order'); return }
    const w = window.open('', '_blank')
    const sheetsHTML = selectedOrders.map(o => buildSheetHTML(o)).join('')
    w.document.write('<html><head><title>Batch Production Sheets</title><style>* { box-sizing: border-box; } body { font-family: Arial, sans-serif; padding: 24px; font-size: 13px; } @media print { button { display: none } }</style></head><body>' + sheetsHTML + '<button onclick="window.print()" style="margin-top:16px;padding:8px 16px;font-size:14px">Print batch</button></body></html>')
    w.document.close()
  }

  async function sendToProduction() {
    if (!selectedOrders.length) { toast('Select at least one order'); return }
    setMoving(true)
    try {
      for (const o of selectedOrders) {
        const updated = await updateOrder(o.id, { stage: 'In Production' })
        setOrders(prev => prev.map(x => x.id === o.id ? updated : x))
      }
      setChecked({})
      toast(selectedOrders.length + ' order' + (selectedOrders.length > 1 ? 's' : '') + ' moved to In Production')
    } catch (e) {
      toast(e.message, 'error')
    }
    setMoving(false)
  }

  async function batchPrintAndSend() {
    batchPrint()
    await sendToProduction()
  }

  function handleUpdated(updated) {
    setOrders(prev => prev.map(x => x.id === updated.id ? updated : x))
    setSelected(null)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#888' }}>{verified.length} order{verified.length !== 1 ? 's' : ''} awaiting production</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {selectedOrders.length > 0 && (
            <>
              <Btn size="sm" onClick={batchPrint}>Print selected ({selectedOrders.length})</Btn>
              <Btn size="sm" variant="primary" onClick={batchPrintAndSend} disabled={moving}>
                {moving ? 'Moving…' : 'Print & send to production (' + selectedOrders.length + ')'}
              </Btn>
            </>
          )}
        </div>
      </div>
      {verified.length === 0 && (
        <div style={{ background: '#fff', border: '1px solid #e0ddd8', borderRadius: 10, padding: 32, textAlign: 'center', fontSize: 12, color: '#bbb' }}>
          No verified orders waiting
        </div>
      )}
      {verified.length > 0 && (
        <div style={{ marginBottom: 8, paddingLeft: 10 }}>
          <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ cursor: 'pointer', marginRight: 8, width: 16, height: 16 }} />
          <span style={{ fontSize: 12, color: '#888' }}>{allChecked ? 'Deselect all' : 'Select all'}</span>
        </div>
      )}
      {verified.map(o => (
        <div key={o.id} onClick={() => toggleCheck(o.id)} style={{ background: checked[o.id] ? '#F0F7FF' : '#fff', border: checked[o.id] ? '1px solid #185FA5' : '1px solid #e0ddd8', borderRadius: 10, padding: '13px 15px', marginBottom: 10, cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              <input type="checkbox" checked={!!checked[o.id]} onChange={() => toggleCheck(o.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', flexShrink: 0, width: 16, height: 16 }} />
              <div onClick={e => { e.stopPropagation(); setSelected(o) }} style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{o.order_ref}{getOrderItems(o).length > 1 ? <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706', marginLeft: 8 }}>⚠ {getOrderItems(o).length} items</span> : null}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name} — {getOrderItems(o)[0].car || o.car}</div>
              </div>
            </div>
            <StageBadge stage={o.stage} />
          </div>
          <div style={{ paddingLeft: 26, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          </div>
          {o.notes && (
            <div style={{ marginTop: 8, marginLeft: 26, fontSize: 11, background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: 4, padding: '3px 8px', display: 'inline-block' }}>{o.notes}</div>
          )}
        </div>
      ))}
      {selected && <OrderModal order={selected} role={role} onClose={() => setSelected(null)} onUpdated={handleUpdated} />}
    </>
  )
}
