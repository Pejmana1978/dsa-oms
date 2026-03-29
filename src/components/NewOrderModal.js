import { useState } from 'react'
import Modal from './Modal'
import Btn from './Btn'
import { SEAT_OPTIONS } from '../lib/constants'
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

export default function NewOrderModal({ onClose, onCreated }) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    customer_name: '', phone: '', email: '',
    car: '', vin: '', seats: 'Full set (5)', color: '',
    source: 'Shopify', order_date: new Date().toISOString().slice(0, 10),
    notes: '', stage: 'New', photos: []
  })

  function setF(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  async function handleSubmit() {
    if (!form.customer_name || !form.car) { toast('Customer name and car are required', 'error'); return }
    setSaving(true)
    try {
      const ref = 'SC-' + Date.now().toString().slice(-4)
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
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Customer name *"><input value={form.customer_name} onChange={e => setF('customer_name', e.target.value)} placeholder="Full name" autoFocus /></Field>
          <Field label="Phone"><input value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="+46 70 000 00 00" /></Field>
        </div>
        <Field label="Email"><input type="email" value={form.email} onChange={e => setF('email', e.target.value)} placeholder="customer@example.com" /></Field>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#666', borderBottom: '1px solid #e0ddd8', paddingBottom: 5 }}>Vehicle & product</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Car (make / model / year) *"><input value={form.car} onChange={e => setF('car', e.target.value)} placeholder="e.g. Volvo XC60 2021" /></Field>
          <Field label="VIN number"><input value={form.vin} onChange={e => setF('vin', e.target.value)} placeholder="17-character VIN" style={{ fontFamily: 'monospace', fontSize: 11 }} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Seats to cover">
            <select value={form.seats} onChange={e => setF('seats', e.target.value)}>
              {SEAT_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Color / material"><input value={form.color} onChange={e => setF('color', e.target.value)} placeholder="e.g. Black/Grey" /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Source">
            <select value={form.source} onChange={e => setF('source', e.target.value)}>
              {['Shopify', 'eBay', 'Manual'].map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Order date"><input type="date" value={form.order_date} onChange={e => setF('order_date', e.target.value)} /></Field>
        </div>
        <Field label="Production notes"><textarea value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Special requests, fitment notes, urgency…" /></Field>
      </div>
    </Modal>
  )
}
