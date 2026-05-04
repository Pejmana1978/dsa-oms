import { useState } from 'react'
import { StageBadge } from '../components/Badges'
import Btn from '../components/Btn'
import { updateOrder } from '../lib/api'
import { useToast } from '../components/Toast'
import OrderModal from '../components/OrderModal'

export default function VerifiedPage({ orders, setOrders, role }) {
  const [selected, setSelected] = useState(null)
  const [checked, setChecked] = useState({})
  const [moving, setMoving] = useState(false)
  const toast = useToast()

  const verified = orders.filter(o => o.stage === 'Verified' && !o.archived)

  function toggleCheck(id) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleAll() {
    const allChecked = verified.every(o => checked[o.id])
    const next = {}
    verified.forEach(o => { next[o.id] = !allChecked })
    setChecked(next)
  }

  const selectedOrders = verified.filter(o => checked[o.id])

  function buildSheetHTML(o) {
    const customerPhotos = (o.photos || []).filter(p => p.url && ['jpg','jpeg','png','gif','webp'].includes((p.name||'').split('.').pop().toLowerCase()))
    const positions = (o.position || []).join(' & ') || '—'
    const isMultiPos = (o.position||[]).length > 1
    const photosRow = customerPhotos.length > 0
      ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid #eee">' +
        customerPhotos.map(p => '<img src="' + p.url + '" style="height:120px;max-width:160px;object-fit:contain;border-radius:4px;border:1px solid #ddd;background:#f9f9f9" loading="lazy"/>').join('') +
        '</div>'
      : ''
    const thumbImg = o.thumbnail
      ? '<img src="' + o.thumbnail.replace('s-l1600', 's-l500') + '" style="height:90px;max-width:110px;object-fit:contain;border-radius:4px;border:1px solid #ddd;background:#f9f9f9;display:block"/>'
      : ''
    const notesHtml = o.notes
      ? '<div style="font-size:11px;background:#FFFBEB;border:1px solid #F59E0B;border-radius:4px;padding:3px 7px;margin-top:6px;display:inline-block">' + o.notes + '</div>'
      : ''
    const lastCol = (o.vin ? '<div style="font-size:10px;font-family:monospace;color:#555;margin-bottom:4px">VIN: ' + o.vin + '</div>' : '') +
      (o.year ? '<div style="font-size:11px;color:#555;margin-bottom:6px">Year: ' + o.year + '</div>' : '') +
      notesHtml
    return '<div style="border:1px solid #ccc;border-radius:6px;padding:14px;margin-bottom:16px;page-break-inside:avoid">' +
      '<table style="width:100%;border-collapse:collapse"><tr>' +
      '<td style="width:22%;vertical-align:top;padding-right:10px"><div style="font-size:15px;font-weight:bold;line-height:1.3">' + o.car + '</div><div style="font-size:11px;color:#666;margin-top:3px">Order: ' + o.order_ref + '</div></td>' +
      '<td style="width:28%;vertical-align:top;padding-right:10px"><div style="font-size:15px;font-weight:bold;color:' + (isMultiPos ? '#d97706' : '#000') + '">' + positions + '</div><div style="font-size:13px;margin-top:3px">' + (o.material || '—') + '</div><div style="font-size:13px;color:#333">' + (o.color || '—') + '</div></td>' +
      '<td style="width:8%;vertical-align:top;text-align:center"><div style="font-size:48px;font-weight:bold;line-height:1">' + (o.quantity || 1) + '</div></td>' +
      '<td style="width:16%;vertical-align:top;padding:0 10px">' + thumbImg + '</td>' +
      '<td style="width:26%;vertical-align:top">' + lastCol + '</td>' +
      '</tr></table>' + photosRow + '</div>'
  }

  function batchPrint() {
    if (!selectedOrders.length) { toast('Select at least one order'); return }
    const w = window.open('', '_blank')
    const sheetsHTML = selectedOrders.map(o => buildSheetHTML(o)).join('')
    w.document.write('<html><head><title>Batch Production Sheets</title><style>* { box-sizing: border-box; } body { font-family: Arial, sans-serif; padding: 24px; font-size: 13px; color: #000; } @media print { button { display: none } }</style></head><body>' + sheetsHTML + '<button onclick="window.print()" style="margin-top:16px;padding:8px 16px;font-size:14px">Print batch</button></body></html>')
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

  const allChecked = verified.length > 0 && verified.every(o => checked[o.id])

  return (
    <div style={{ width: '100%' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '4px 10px' }}>
          <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ cursor: 'pointer' }} />
          <span style={{ fontSize: 12, color: '#888' }}>{allChecked ? 'Deselect all' : 'Select all'}</span>
        </div>
      )}
      {verified.map(o => (
        <div key={o.id} style={{ background: checked[o.id] ? '#F0F7FF' : '#fff', border: checked[o.id] ? '1px solid #185FA5' : '1px solid #e0ddd8', borderRadius: 10, padding: '13px 15px', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={!!checked[o.id]} onChange={() => toggleCheck(o.id)} style={{ marginTop: 3, cursor: 'pointer', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ cursor: 'pointer' }} onClick={() => setSelected(o)}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{o.order_ref}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{o.customer_name} — {o.car}</div>
              </div>
              <StageBadge stage={o.stage} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              {[
                ['Position', (o.position || []).join(', ') || '—'],
                ['Material', o.material || '—'],
                ['Color / Trim', o.color || '—'],
                ['Quantity', o.quantity || 1],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>{k}</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>
            {o.notes && (
              <div style={{ marginTop: 8, fontSize: 11, background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: 4, padding: '3px 8px', display: 'inline-block' }}>{o.notes}</div>
            )}
          </div>
          </div>
        </div>
      ))}
      {selected && <OrderModal order={selected} role={role} onClose={() => setSelected(null)} onUpdated={handleUpdated} />}
    </div>
  )
}
