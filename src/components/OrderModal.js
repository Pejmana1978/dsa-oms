import { useState, useRef } from 'react'
import Modal from './Modal'
import Btn from './Btn'
import { StageBadge } from './Badges'
import StageProgress from './StageProgress'
import { STAGES, SEAT_OPTIONS } from '../lib/constants'
import { updateOrder, uploadPhoto, deletePhoto } from '../lib/api'
import { useToast } from './Toast'

const TABS = ['Details', 'Photos & VIN', 'Email / SMS', 'Print / Export']

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

export default function OrderModal({ order, onClose, onUpdated, role }) {
  const [tab, setTab] = useState('Details')
  const [form, setForm] = useState({ ...order })
  const [saving, setSaving] = useState(false)
  const [photos, setPhotos] = useState(order.photos || [])
  const fileRef = useRef()
  const toast = useToast()

  const canEdit = role === 'admin' || role === 'sales' || role === 'production'

  function setF(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  async function save(advanceStage = false) {
    setSaving(true)
    try {
      let updates = { ...form, photos }
      if (advanceStage) {
        const idx = STAGES.indexOf(form.stage)
        if (idx < STAGES.length - 1) updates.stage = STAGES[idx + 1]
      }
      const updated = await updateOrder(order.id, updates)
      onUpdated(updated)
      toast(advanceStage ? `Advanced to "${updates.stage}"` : 'Order saved')
      if (!advanceStage) onClose()
      else { setForm(updated); onClose() }
    } catch (e) {
      toast(e.message, 'error')
    }
    setSaving(false)
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    try {
      const { path, url } = await uploadPhoto(order.id, file)
      const newPhotos = [...photos, { path, url, name: file.name }]
      setPhotos(newPhotos)
      await updateOrder(order.id, { photos: newPhotos })
      toast('Photo uploaded')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function handleDeletePhoto(photo, idx) {
    try {
      if (photo.path) await deletePhoto(photo.path)
      const newPhotos = photos.filter((_, i) => i !== idx)
      setPhotos(newPhotos)
      await updateOrder(order.id, { photos: newPhotos })
      toast('Photo removed')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const stageIdx = STAGES.indexOf(form.stage)
  const canAdvance = stageIdx < STAGES.length - 1

  const firstName = order.customer_name?.split(' ')[0] || 'there'
  const verifyTpl = `Hi ${firstName},\n\nWe've received your order ${order.order_ref} for ${order.seats} seat covers for your ${order.car}.\n\nTo proceed, please send us:\n1. A photo of your car interior (showing the seats)\n2. A photo of your VIN plate\n\nYou can reply directly to this email or send via WhatsApp.\n\nThanks,\nSeatCover Team`
  const shipTpl = `Hi ${firstName},\n\nGreat news — your order ${order.order_ref} has been shipped!\n\nProduct: ${order.seats} seat covers, ${order.color}\nCar: ${order.car}\n\nYou'll receive a tracking number shortly. Thank you for your order!\n\nThanks,\nSeatCover Team`
  const smsTpl = `SeatCover: Your order ${order.order_ref} is confirmed. We'll contact you shortly about verification. Reply STOP to opt out.`
  const waTpl = `Hi ${firstName}! Your SeatCover order *${order.order_ref}* is confirmed 🎉\n\nWe need a couple of photos to get started — could you send us:\n📸 Your car interior (seats)\n📸 Your VIN plate\n\nThanks!`

  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard')).catch(() => toast('Copy failed', 'error'))
  }

  function fmtDate(d) { return d ? d.slice(0, 10).split('-').reverse().join('/') : '—' }

  const footer = tab === 'Details' && canEdit ? (
    <>
      <Btn onClick={onClose}>Cancel</Btn>
      <Btn onClick={() => save(false)} disabled={saving} variant="default">Save</Btn>
      {canAdvance && <Btn onClick={() => save(true)} disabled={saving} variant="primary">Save & advance →</Btn>}
    </>
  ) : tab === 'Print / Export' ? (
    <>
      <Btn onClick={onClose}>Close</Btn>
      <Btn onClick={() => window.print()} variant="success">Print production sheet</Btn>
      <Btn onClick={() => window.print()} variant="primary">Print shipping label</Btn>
    </>
  ) : <Btn onClick={onClose}>Close</Btn>

  return (
    <Modal title={`${order.order_ref} — ${order.customer_name}`} onClose={onClose} footer={footer} wide>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e0ddd8', marginBottom: 16, gap: 0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: tab === t ? '#185FA5' : '#888',
            borderBottom: `2px solid ${tab === t ? '#185FA5' : 'transparent'}`,
            marginBottom: -1, fontWeight: tab === t ? 600 : 400
          }}>{t}</button>
        ))}
      </div>

      {/* DETAILS TAB */}
      {tab === 'Details' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <StageProgress stage={form.stage} />
          <Row>
            <Field label="Customer name"><input value={form.customer_name || ''} onChange={e => setF('customer_name', e.target.value)} readOnly={!canEdit} /></Field>
            <Field label="Phone"><input value={form.phone || ''} onChange={e => setF('phone', e.target.value)} readOnly={!canEdit} /></Field>
          </Row>
          <Field label="Email"><input value={form.email || ''} onChange={e => setF('email', e.target.value)} readOnly={!canEdit} /></Field>
          <SectionLabel>Vehicle & product</SectionLabel>
          <Row>
            <Field label="Car (make / model / year)"><input value={form.car || ''} onChange={e => setF('car', e.target.value)} readOnly={!canEdit} /></Field>
            <Field label="VIN number"><input value={form.vin || ''} onChange={e => setF('vin', e.target.value)} style={{ fontFamily: 'monospace', fontSize: 11 }} readOnly={!canEdit} /></Field>
          </Row>
          <Row>
            <Field label="Seats to cover">
              <select value={form.seats || ''} onChange={e => setF('seats', e.target.value)} disabled={!canEdit}>
                {SEAT_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Color / material"><input value={form.color || ''} onChange={e => setF('color', e.target.value)} readOnly={!canEdit} /></Field>
          </Row>
          <Row>
            <Field label="Source">
              <select value={form.source || ''} onChange={e => setF('source', e.target.value)} disabled={!canEdit}>
                {['Shopify', 'eBay', 'Manual'].map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Order date"><input type="date" value={form.order_date || ''} onChange={e => setF('order_date', e.target.value)} readOnly={!canEdit} /></Field>
          </Row>
          <Field label="Production notes">
            <textarea value={form.notes || ''} onChange={e => setF('notes', e.target.value)} readOnly={!canEdit} />
          </Field>
          {canEdit && (
            <Field label="Move to stage">
              <select value={form.stage} onChange={e => setF('stage', e.target.value)}>
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          )}
        </div>
      )}

      {/* PHOTOS TAB */}
      {tab === 'Photos & VIN' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionLabel>Uploaded photos & VIN images</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {photos.length === 0 && <span style={{ fontSize: 12, color: '#aaa' }}>No photos uploaded yet</span>}
            {photos.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#f5f5f4', border: '1px solid #e0ddd8', borderRadius: 6, fontSize: 12 }}>
                {p.url
                  ? <a href={p.url} target="_blank" rel="noreferrer" style={{ color: '#185FA5' }}>{p.name || `photo-${i + 1}`}</a>
                  : <span>{typeof p === 'string' ? p : p.name}</span>}
                <button onClick={() => handleDeletePhoto(p, i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 14, lineHeight: 1 }}>✕</button>
              </div>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
          <div onClick={() => fileRef.current?.click()} style={{ border: '1px dashed #ccc', borderRadius: 6, padding: 14, textAlign: 'center', fontSize: 12, color: '#888', cursor: 'pointer', background: '#fafaf9' }}>
            + Click to upload photo or VIN image
          </div>
        </div>
      )}

      {/* EMAIL / SMS TAB */}
      {tab === 'Email / SMS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: 'Verification request email', text: verifyTpl },
            { label: 'Shipping confirmation email', text: shipTpl },
            { label: 'Order confirmation SMS', text: smsTpl },
            { label: 'WhatsApp message', text: waTpl },
          ].map(({ label, text }) => (
            <div key={label} style={{ border: '1px solid #e0ddd8', borderRadius: 8, padding: '10px 12px', background: '#fafaf9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: '#666' }}>{label}</span>
                <Btn size="sm" onClick={() => copyText(text)}>Copy</Btn>
              </div>
              <textarea defaultValue={text} style={{ fontSize: 12, minHeight: 80, background: 'transparent', border: 'none', outline: 'none', width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          ))}
          <div style={{ background: '#f0f9f5', border: '1px solid #9FE1CB', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#0F6E56' }}>
            Templates are pre-filled with order details. Copy and send via your email client, SMS app, or WhatsApp.
          </div>
        </div>
      )}

      {/* PRINT TAB */}
      {tab === 'Print / Export' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="printable">
          <SectionLabel>Production sheet</SectionLabel>
          <div style={{ border: '1px solid #e0ddd8', borderRadius: 8, padding: 14, fontSize: 12, lineHeight: 1.9, background: '#fafaf9' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, borderBottom: '1px solid #e0ddd8', paddingBottom: 6 }}>Production sheet — {order.order_ref}</div>
            {[['Order ID', order.order_ref], ['Date', fmtDate(order.order_date || order.created_at)], ['Customer', order.customer_name], ['Phone', order.phone], ['Car', order.car], ['VIN', order.vin || '—'], ['Seats', order.seats], ['Color / material', order.color], ['Notes', order.notes || '—'], ['Status', order.stage]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                <span style={{ color: '#888', minWidth: 130 }}>{k}</span>
                <span style={{ fontWeight: k === 'VIN' ? 400 : undefined, fontFamily: k === 'VIN' ? 'monospace' : undefined }}>{v}</span>
              </div>
            ))}
          </div>
          <SectionLabel>Shipping label</SectionLabel>
          <div style={{ border: '2px solid #e0ddd8', borderRadius: 8, padding: 14, fontSize: 12, lineHeight: 1.9 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Shipping label — {order.order_ref}</div>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#888', minWidth: 60 }}>To</span><strong>{order.customer_name}</strong></div>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#888', minWidth: 60 }}>Email</span><span>{order.email}</span></div>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#888', minWidth: 60 }}>Phone</span><span>{order.phone}</span></div>
            <div style={{ border: '1px solid #e0ddd8', borderRadius: 6, padding: 10, marginTop: 10, background: '#f5f5f4' }}>
              <div style={{ fontWeight: 600 }}>{order.seats} seat covers — {order.color}</div>
              <div style={{ color: '#888', fontSize: 11 }}>{order.car}</div>
            </div>
            <div style={{ marginTop: 10, fontFamily: 'monospace', fontSize: 13, letterSpacing: 2, textAlign: 'center', padding: '6px', border: '1px solid #e0ddd8', borderRadius: 4 }}>{order.order_ref}</div>
          </div>
        </div>
      )}
    </Modal>
  )
}
