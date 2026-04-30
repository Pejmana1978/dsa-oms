import { useState } from 'react'
import Modal from './Modal'
import Btn from './Btn'
import { POSITION_OPTIONS, MATERIAL_OPTIONS } from '../lib/constants'
import { createOrder } from '../lib/api'
import { useToast } from './Toast'

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ fontSize: 11, color: '#666' }}>{label}</label>
      {children}
    </div>
  )
}

function Row({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: '#666', borderBottom: '1px solid #e0ddd8', paddingBottom: 5, marginTop: 4 }}>{children}</div>
}

export default function NewOrderModal({ onClose, onCreated }) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    order_ref: '', customer_name: '', phone: '', email: '', address: '',
    car: '', vin: '', year: '', position: [], position_other: '',
    material: '', color: '', quantity: 1,
    source: 'Website', order_date: new Date().toISOString().slice(0, 10),
    notes: '', stage: 'New', photos: [], tracking_number: ''
  })

  function setF(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  async function handleSubmit() {
    if (!form.customer_name || !form.car) { toast('Customer name and car are required', 'error'); return }
    setSaving(true)
    try {
      const ref = form.order_ref.trim() || 'SC-' + Date.now().toString().slice(-4)
      const order = await createOrder({ ...form, order_ref: ref })
      onCreated(order)
      toast(`Order ${ref} created`)
      onClose()
    } catch (e) {
      toast(e.message, 'error')
    }
    setSaving(false)
  }

  return (
    <Modal
      title="New order"
      onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn onClick={handleSubmit} disabled={saving} variant="primary">{saving ? 'Creating…' : 'Create order'}</Btn></>}
      wide
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        <Field label="Production notes">
          <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} style={{ minHeight: 50, background: form.notes ? '#FFFBEB' : '', border: form.notes ? '1px solid #F59E0B' : '' }} placeholder="Special requests, urgency…" />
        </Field>
        <SectionLabel>Vehicle and product</SectionLabel>
        <Row>
          <Field label="Car (make / model / year) *"><input value={form.car} onChange={e => setF('car', e.target.value)} placeholder="e.g. Mercedes-Benz C-Class 2019" autoFocus /></Field>
          <Field label="VIN number"><input value={form.vin} onChange={e => setF('vin', e.target.value)} placeholder="17-character VIN" style={{ fontFamily: 'monospace', fontSize: 11 }} /></Field>
        </Row>
        <Field label="Year (specific to this order)">
          <input value={form.year} onChange={e => setF('year', e.target.value)} placeholder="e.g. 2019" style={{ width: 100 }} />
        </Field>
        <Field label="Position (select all that apply)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {POSITION_OPTIONS.map(p => (
              <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox"
                  checked={(form.position || []).includes(p)}
                  onChange={e => {
                    const cur = form.position || []
                    setF('position', e.target.checked ? [...cur, p] : cur.filter(x => x !== p))
                  }} />
                {p}
              </label>
            ))}
          </div>
          {(form.position || []).includes('Other') && (
            <input value={form.position_other} onChange={e => setF('position_other', e.target.value)} placeholder="Describe other position..." style={{ marginTop: 6 }} />
          )}
        </Field>
        <Row>
          <Field label="Material">
            <select value={form.material} onChange={e => setF('material', e.target.value)}>
              <option value="">— select —</option>
              {MATERIAL_OPTIONS.map(m => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Color + trim code"><input value={form.color} onChange={e => setF('color', e.target.value)} placeholder="e.g. Black 040" /></Field>
        </Row>
        <Row>
          <Field label="Quantity"><input type="number" min="1" value={form.quantity} onChange={e => setF('quantity', parseInt(e.target.value))} style={{ width: 80 }} /></Field>
        </Row>
        <SectionLabel>Files (photos, documents, VIN images)</SectionLabel>
        <div style={{ border: '1px dashed #ccc', borderRadius: 6, padding: 14, textAlign: 'center', fontSize: 12, color: '#aaa' }}>Photos can be added after creating the order</div>
        <SectionLabel>Customer and shipping</SectionLabel>
        <Row>
          <Field label="Customer name *"><input value={form.customer_name} onChange={e => setF('customer_name', e.target.value)} placeholder="Full name" /></Field>
          <Field label="Phone"><input value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="+46 70 000 00 00" /></Field>
        </Row>
        <Row>
          <Field label="Email"><input type="email" value={form.email} onChange={e => setF('email', e.target.value)} placeholder="customer@example.com" /></Field>
          <Field label="Tracking number"><input value={form.tracking_number} onChange={e => setF('tracking_number', e.target.value)} placeholder="e.g. 1Z6V1294..." /></Field>
        </Row>
        <Field label="Shipping address">
          <textarea value={form.address} onChange={e => setF('address', e.target.value)} style={{ minHeight: 60 }} placeholder={'Street\nCity\nPostcode\nCountry'} />
        </Field>
        <Row>
          <Field label="Source">
            <select value={form.source} onChange={e => setF('source', e.target.value)}>
              {['Website', 'eBay', 'Manual'].map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Order date"><input type="date" value={form.order_date} onChange={e => setF('order_date', e.target.value)} /></Field>
        </Row>
        <Field label="Order number (leave blank to auto-generate)">
          <input value={form.order_ref} onChange={e => setF('order_ref', e.target.value)} placeholder="e.g. SC-1234 or leave blank" />
        </Field>
      </div>
    </Modal>
  )
}
