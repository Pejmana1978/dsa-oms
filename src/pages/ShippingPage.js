import { useState } from 'react'
import { StageBadge } from '../components/Badges'
import Btn from '../components/Btn'
import { STAGES } from '../lib/constants'
import { updateOrder } from '../lib/api'
import { useToast } from '../components/Toast'
import OrderModal from '../components/OrderModal'

export default function ShippingPage({ orders, setOrders, role }) {
  const [selected, setSelected] = useState(null)
  const [labelLoading, setLabelLoading] = useState({})
  const [addressModal, setAddressModal] = useState(null)
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

  function downloadPDF(base64, trackingNumber) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `label-${trackingNumber}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function upsLabel(o) {
    if (!o.address) { toast('No address on this order', 'error'); return; }
    setLabelLoading(prev => ({ ...prev, [o.id]: 'validating' }))
    try {
      const valRes = await fetch('/api/ups-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: o, validateOnly: true })
      })
      const valData = await valRes.json()
      const candidates = valData.validation?.XAVResponse?.Candidate
      const ambiguous = Array.isArray(candidates) && candidates.length > 1
      if (ambiguous) {
        setAddressModal({ order: o, candidates })
        setLabelLoading(prev => ({ ...prev, [o.id]: null }))
        return
      }
      await generateLabel(o)
    } catch(e) { toast(e.message, 'error'); setLabelLoading(prev => ({ ...prev, [o.id]: null })) }
  }

  async function generateLabel(o) {
    setLabelLoading(prev => ({ ...prev, [o.id]: 'generating' }))
    try {
      const res = await fetch('/api/ups-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: o })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const { updateOrder } = await import('../lib/api')
      const updated = await updateOrder(o.id, { tracking_number: data.trackingNumber, label_pdf: data.labelBase64 })
      setOrders(prev => prev.map(x => x.id === o.id ? updated : x))
      downloadPDF(data.labelBase64, data.trackingNumber)
      toast(`Label created — tracking: ${data.trackingNumber}`)
    } catch(e) { toast(e.message, 'error') }
    setLabelLoading(prev => ({ ...prev, [o.id]: null }))
    setAddressModal(null)
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
                    {o.tracking_number && <div style={{ fontSize: 10, color: '#185FA5', marginTop: 2 }}>📦 {o.tracking_number}</div>}
                  </td>
                  <td style={{ padding: '9px 11px' }}>
                    <div style={{ fontSize: 12 }}>{o.car}</div>
                    <div style={{ fontSize: 10, color: '#aaa' }}>{o.seats} · {o.color}</div>
                  </td>
                  <td style={{ padding: '9px 11px' }}><StageBadge stage={o.stage} /></td>
                  <td style={{ padding: '9px 11px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <Btn size="sm" onClick={() => o.tracking_number && o.label_pdf ? downloadPDF(o.label_pdf, o.tracking_number) : upsLabel(o)} disabled={!!labelLoading[o.id]}>{labelLoading[o.id] === 'validating' ? 'Validating…' : labelLoading[o.id] === 'generating' ? 'Generating…' : o.tracking_number ? '🖨 Reprint' : '📦 UPS Label'}</Btn>
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
      {addressModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'#fff', borderRadius:12, padding:28, maxWidth:480, width:'90%' }}>
            <h3 style={{ marginBottom:12, fontSize:15 }}>Address Verification</h3>
            <p style={{ fontSize:12, color:'#666', marginBottom:16 }}>UPS found multiple address suggestions. Please select the correct one or proceed with the original.</p>
            {addressModal.candidates.map((c, i) => {
              const a = c.AddressKeyFormat
              const formatted = [a.AddressLine, a.PoliticalDivision2, a.PostcodePrimaryLow, a.CountryCode].filter(Boolean).join(', ')
              return (
                <div key={i} onClick={() => generateLabel({ ...addressModal.order, address: formatted })}
                  style={{ padding:'10px 14px', border:'1px solid #e0ddd8', borderRadius:8, marginBottom:8, cursor:'pointer', fontSize:12 }}
                  onMouseEnter={e => e.currentTarget.style.background='#f5f5f5'}
                  onMouseLeave={e => e.currentTarget.style.background=''}>
                  {formatted}
                </div>
              )
            })}
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <Btn size="sm" onClick={() => generateLabel(addressModal.order)}>Use original address</Btn>
              <Btn size="sm" variant="danger" onClick={() => setAddressModal(null)}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
