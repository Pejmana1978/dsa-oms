import { useState } from 'react'
import Modal from './Modal'
import Btn from './Btn'
import { POSITION_OPTIONS, MATERIAL_OPTIONS } from '../lib/constants'
import { createOrder, updateOrder, uploadPhoto, authHeaders } from '../lib/api'
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
  const [reading, setReading] = useState(false)
  // The uploaded invoice PDF is attached to the order once it's created.
  const [invoiceFile, setInvoiceFile] = useState(null)
  const [invoiceItems, setInvoiceItems] = useState([])
  const [form, setForm] = useState({
    order_ref: '', customer_name: '', phone: '', email: '', address: '',
    car: '', vin: '', year: '', position: [], position_other: '',
    material: '', color: '', quantity: 1,
    source: 'Website', order_date: new Date().toISOString().slice(0, 10),
    notes: '', stage: 'New', photos: [], tracking_number: ''
  })

  function setF(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  // Read a Stripe invoice PDF and pre-fill the form. Nothing is saved here —
  // the operator checks the parsed values before creating the order, because a
  // misread spec would go straight to production.
  async function handleInvoice(file) {
    if (!file) return
    if (!/\.pdf$/i.test(file.name)) { toast('Please choose a PDF invoice', 'error'); return }
    setReading(true)
    try {
      const b64 = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result).split(',')[1] || '')
        r.onerror = () => reject(new Error('Could not read the file'))
        r.readAsDataURL(file)
      })
      const res = await fetch('/api/parse-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ fileBase64: b64 })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const p = data.parsed
      const first = p.items?.[0] || {}
      setForm(prev => ({
        ...prev,
        order_ref: p.invoiceNumber || prev.order_ref,
        customer_name: p.customerName || prev.customer_name,
        email: p.email || prev.email,
        phone: p.phone || prev.phone,
        address: p.address || prev.address,
        order_date: p.orderDate || prev.order_date,
        source: 'Manual',
        car: first.car || prev.car,
        year: first.year || prev.year,
        position: (first.position && first.position.length) ? first.position : prev.position,
        material: first.material || prev.material,
        color: first.color || prev.color,
        quantity: first.quantity || prev.quantity,
        notes: [prev.notes, ...(p.items || []).map(i => i.description)].filter(Boolean).join('\n'),
      }))
      setInvoiceItems(p.items || [])
      setInvoiceFile(file)
      const missing = []
      if (!first.car) missing.push('car')
      if (!first.material) missing.push('material')
      if (!first.color) missing.push('colour')
      toast(missing.length
        ? `Invoice read — please check/fill: ${missing.join(', ')}`
        : 'Invoice read — please check the details before creating')
    } catch (e) {
      toast(e.message, 'error')
    }
    setReading(false)
  }

  async function handleSubmit() {
    if (!form.customer_name || !form.car) { toast('Customer name and car are required', 'error'); return }
    setSaving(true)
    try {
      const ref = form.order_ref.trim() || 'SC-' + Date.now().toString().slice(-4)
      // Carry every invoice line through as its own production item.
      const items = invoiceItems.length ? invoiceItems.map(i => ({
        title: i.description || '',
        quantity: i.quantity || 1,
        price: i.price ?? null,
        currency: i.currency || '',
        item_id: '', sku: '', thumbnail: '', custom_thumbnail: '',
        car: i.car || form.car, vin: '', year: i.year || '',
        position: i.position || [], position_other: '',
        material: i.material || '', color: i.color || '', item_notes: '',
      })) : null
      const totals = invoiceItems.reduce((s, i) => s + (Number(i.price) || 0), 0)
      let order = await createOrder({
        ...form,
        order_ref: ref,
        ...(items ? { items, sale_amount: totals || null, sale_currency: invoiceItems[0]?.currency || null } : {}),
      })

      // Keep the invoice itself with the order — one click away from the job.
      if (invoiceFile) {
        try {
          const { path, url } = await uploadPhoto(order.id, invoiceFile)
          const documents = [{ path, url, name: invoiceFile.name }]
          order = await updateOrder(order.id, { documents })
        } catch (e) {
          toast('Order created, but the invoice PDF failed to attach: ' + e.message, 'error')
        }
      }
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
        {/* Start from a Stripe invoice instead of typing everything in. */}
        <div
          onClick={() => { if (reading) return; const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/pdf,.pdf'; i.onchange = e => handleInvoice(e.target.files[0]); i.click() }}
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = '#EAF2FB' }}
          onDragLeave={e => { e.currentTarget.style.background = '#F7FAFF' }}
          onDrop={e => { e.preventDefault(); e.currentTarget.style.background = '#F7FAFF'; handleInvoice(e.dataTransfer.files[0]) }}
          style={{
            border: '1px dashed #185FA5', borderRadius: 8, padding: 14, textAlign: 'center',
            fontSize: 12, color: '#185FA5', cursor: reading ? 'wait' : 'pointer', background: '#F7FAFF'
          }}>
          {reading
            ? 'Reading invoice…'
            : invoiceFile
              ? `📄 ${invoiceFile.name} — details filled in below, please check them`
              : '📄 Drop a Stripe invoice PDF here, or click to upload — it fills in the order for you'}
        </div>
        {invoiceItems.length > 1 && (
          <div style={{ fontSize: 11, color: '#92400E', background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: 6, padding: '6px 10px' }}>
            {invoiceItems.length} invoice lines found — each becomes its own production item. The fields below show the first one.
          </div>
        )}
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
          <Field label="Quantity"><input type="number" min="1" value={form.quantity} onChange={e => setF('quantity', parseInt(e.target.value) || 1)} style={{ width: 80 }} /></Field>
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
