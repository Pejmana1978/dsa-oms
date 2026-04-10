import { useState, useRef } from 'react'
import Modal from './Modal'
import Btn from './Btn'
import StageProgress from './StageProgress'
import { STAGES, POSITION_OPTIONS, MATERIAL_OPTIONS } from '../lib/constants'
import StockPicker from './StockPicker'
import { updateOrder, uploadPhoto, deletePhoto } from '../lib/api'
import { useToast } from './Toast'

const TABS = ['Details', 'Email / SMS', 'Print / Export']

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
  const [showStockPicker, setShowStockPicker] = useState(false)
  const [photos, setPhotos] = useState(order.photos || [])
  const fileRef = useRef()
  const toast = useToast()

  const canEdit = role === 'admin' || role === 'sales' || role === 'production'

  function setF(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  const COUNTRY_NAMES = { GB: 'United Kingdom', DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain', NL: 'Netherlands', BE: 'Belgium', AT: 'Austria', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland', PL: 'Poland', PT: 'Portugal', IE: 'Ireland', CH: 'Switzerland', US: 'United States', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand', JP: 'Japan' }
  function expandAddress(addr) {
    if (!addr) return ''
    return addr.replace(/,\s*([A-Z]{2})$/, (m, code) => COUNTRY_NAMES[code] ? ', ' + COUNTRY_NAMES[code] : m)
  }

  function parseTitle() {
    const title = form.car || ''
    // Extract year range
    const yearMatch = title.match(/\b(20\d{2})(?:[\-–](20\d{2}))?\b/)
    const year = yearMatch ? yearMatch[0] : ''
    // Extract make/model - look for common patterns
    const makeModelMatch = title.match(/(?:For\s+)?(?:20\d{2}[\-–]20\d{2}\s+)?([A-Z][\w\-]+(?:\s+[A-Z][\w\-]+){1,3})/i)
    const makeModel = makeModelMatch ? makeModelMatch[1].trim() : ''
    const car = makeModel && year ? `${makeModel} ${year}` : makeModel || title
    // Extract position
    const positions = []
    if (/driver\s+bottom/i.test(title)) positions.push('Driver Bottom')
    if (/driver\s+top/i.test(title)) positions.push('Driver Top')
    if (/passenger\s+bottom/i.test(title)) positions.push('Passenger Bottom')
    if (/passenger\s+top/i.test(title)) positions.push('Passenger Top')
    // Extract material
    let material = ''
    if (/leather\s+perf/i.test(title)) material = 'Leather perf'
    else if (/leather/i.test(title)) material = 'Leather'
    else if (/vinyl\s+perf/i.test(title)) material = 'Vinyl perf'
    else if (/vinyl/i.test(title)) material = 'Vinyl'
    else if (/alcantara/i.test(title)) material = 'Vinyl & Alcantara'
    else if (/cloth/i.test(title)) material = 'Cloth'
    // Extract color
    let color = ''
    const colorMatch = title.match(/\b(black|grey|gray|beige|brown|red|blue|navy|tan|white|cream|camel|cognac|bordeaux)\b/i)
    if (colorMatch) color = colorMatch[1].charAt(0).toUpperCase() + colorMatch[1].slice(1).toLowerCase()
    setForm(prev => ({
      ...prev,
      car: car || prev.car,
      position: positions.length > 0 ? positions : prev.position,
      material: material || prev.material,
      color: color || prev.color,
    }))
  }

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
      // Push tracking to eBay if tracking number was added/changed
      if (order.source === 'eBay' && updates.tracking_number && updates.tracking_number !== order.tracking_number) {
        fetch('/api/ebay-tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.order_ref, trackingNumber: updates.tracking_number })
        }).catch(() => {})
      }
      onClose()
    } catch (e) {
      toast(e.message, 'error')
    }
    setSaving(false)
  }

  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    for (const file of files) {
      try {
        const { path, url } = await uploadPhoto(order.id, file)
        setPhotos(prev => {
          const updated = [...prev, { path, url, name: file.name }]
          updateOrder(order.id, { photos: updated })
          return updated
        })
        toast(`${file.name} uploaded`)
      } catch (err) {
        toast(err.message, 'error')
      }
    }
  }

  async function handleThumbnailUpload(file) {
    if (!file) return
    try {
      const { path, url } = await uploadPhoto(order.id, file)
      setF('thumbnail', url)
      await updateOrder(order.id, { thumbnail: url })
      toast('Thumbnail updated')
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

  const verifyTpl = `Hi ${firstName},\n\nWe have received your order ${order.order_ref} for ${order.seats} seat covers for your ${order.car}.\n\nTo proceed, please send us:\n1. A photo of your car interior (showing the seats)\n2. A photo of your VIN plate\n\nYou can reply directly to this email or send via WhatsApp.\n\nThanks,\nSeatCover Team`
  const shipTpl = `Hi ${firstName},\n\nGreat news - your order ${order.order_ref} has been shipped!\n\nProduct: ${order.seats} seat covers, ${order.color}\nCar: ${order.car}\n\nYou will receive a tracking number shortly.\n\nThanks,\nSeatCover Team`
  const smsTpl = `SeatCover: Your order ${order.order_ref} is confirmed. We will contact you shortly about verification. Reply STOP to opt out.`
  const waTpl = `Hi ${firstName}! Your SeatCover order *${order.order_ref}* is confirmed!\n\nWe need a couple of photos to get started:\n- Your car interior (seats)\n- Your VIN plate\n\nThanks!`

  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard')).catch(() => toast('Copy failed', 'error'))
  }

  function fmtDate(d) { return d ? d.slice(0, 10).split('-').reverse().join('/') : '-' }

  const footer = tab === 'Details' && canEdit ? (
    <>
      <Btn onClick={onClose}>Cancel</Btn>
      <Btn onClick={() => save(false)} disabled={saving}>Save</Btn>
      {canAdvance && <Btn onClick={() => save(true)} disabled={saving} variant="primary">Save & advance</Btn>}
    </>
  ) : tab === 'Print / Export' ? (
    <>
      <Btn onClick={onClose}>Close</Btn>
      <Btn onClick={() => window.print()} variant="success">Print production sheet</Btn>
      <Btn onClick={() => window.print()} variant="primary">Print shipping label</Btn>
    </>
  ) : <Btn onClick={onClose}>Close</Btn>

  return (
    <Modal title={`${order.order_ref} - ${order.customer_name}`} onClose={onClose} footer={footer} wide>
      <div style={{ display: 'flex', borderBottom: '1px solid #e0ddd8', marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: tab === t ? '#185FA5' : '#888',
            borderBottom: `2px solid ${tab === t ? '#185FA5' : 'transparent'}`,
            marginBottom: -1, fontWeight: tab === t ? 600 : 400
          }}>{t}</button>
        ))}
      </div>

      {tab === 'Details' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <StageProgress stage={form.stage} />

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: '#f9f9f8', borderRadius: 8, padding: 10, border: '1px solid #e0ddd8' }}>
            <div
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.opacity = '0.7' }}
              onDragLeave={e => { e.currentTarget.style.opacity = '1' }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.opacity = '1'; const file = e.dataTransfer.files[0]; if (file) handleThumbnailUpload(file) }}
              onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = e => handleThumbnailUpload(e.target.files[0]); input.click() }}
              style={{ position: 'relative', width: 80, height: 80, flexShrink: 0, cursor: 'pointer', borderRadius: 6, overflow: 'hidden', border: '2px dashed #ccc' }}>
              {form.thumbnail
                ? <img src={form.thumbnail} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.target.style.display = 'none' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#aaa', textAlign: 'center', padding: 4 }}>Drop image here</div>}
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: '0.2s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0'}>
                <span style={{ color: '#fff', fontSize: 10 }}>Replace</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#555', lineHeight: 1.6, flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{order.car}</div>
              <div style={{ color: '#888', fontSize: 11 }}>{order.notes}</div>
              {order.tracking_number && <div style={{ marginTop: 4 }}><a href={'https://www.ups.com/track?tracknum=' + order.tracking_number} target='_blank' rel='noreferrer' style={{ fontSize: 11, color: '#185FA5', textDecoration: 'none' }}>📦 {order.tracking_number}</a></div>}
              {order.ebay_item_id && <div style={{ marginTop: 2 }}><a href={'https://www.ebay.co.uk/itm/' + order.ebay_item_id} target='_blank' rel='noreferrer' style={{ fontSize: 11, color: '#185FA5', textDecoration: 'none' }}>View eBay listing →</a></div>}
              {order.source === 'eBay' && order.order_ref && <div style={{ marginTop: 2 }}><a href={'https://www.ebay.co.uk/mesh/ord/details?orderid=' + order.order_ref} target='_blank' rel='noreferrer' style={{ fontSize: 11, color: '#185FA5', textDecoration: 'none' }}>View eBay order →</a></div>}
            </div>
          </div>



          <Field label="Production notes">
            <textarea value={form.notes || ''} onChange={e => setF('notes', e.target.value)} readOnly={!canEdit} style={{ minHeight: 50, background: form.notes ? '#FFFBEB' : '', border: form.notes ? '1px solid #F59E0B' : '', borderRadius: 4 }} />
          </Field>
          <SectionLabel>Vehicle and product</SectionLabel>
          <Row>
            <Field label="Car (make / model / year)">
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={form.car || ''} onChange={e => setF('car', e.target.value)} readOnly={!canEdit} style={{ flex: 1 }} />
                  {canEdit && order.source === 'eBay' && <button onClick={parseTitle} style={{ fontSize: 11, color: '#185FA5', background: '#E6F1FB', border: '1px solid #b3d4f5', borderRadius: 6, padding: '0 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>⚡ Parse</button>}
                </div>
              </Field>
            <Field label="VIN number"><input value={form.vin || ''} onChange={e => setF('vin', e.target.value)} style={{ fontFamily: 'monospace', fontSize: 11 }} readOnly={!canEdit} /></Field>
          </Row>
          <Field label="Position (select all that apply)">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {POSITION_OPTIONS.map(p => (
                <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: canEdit ? 'pointer' : 'default' }}>
                  <input type="checkbox" disabled={!canEdit}
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
              <input value={form.position_other || ''} onChange={e => setF('position_other', e.target.value)} readOnly={!canEdit} placeholder="Describe other position..." style={{ marginTop: 6, width: '100%' }} />
            )}
          </Field>
          <Row>
            <Field label="Material">
              <select value={form.material || ''} onChange={e => setF('material', e.target.value)} disabled={!canEdit}>
                <option value="">— select —</option>
                {MATERIAL_OPTIONS.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Color + trim code"><input value={form.color || ''} onChange={e => setF('color', e.target.value)} readOnly={!canEdit} placeholder="e.g. Black 040" /></Field>
          </Row>
          <Row>
            <Field label="Quantity"><input type="number" min="1" value={form.quantity || 1} onChange={e => setF('quantity', parseInt(e.target.value))} readOnly={!canEdit} style={{ width: 80 }} /></Field>
            <Field label="Ship from Sweden stock">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: canEdit ? 'pointer' : 'default' }}>
                  <input type="checkbox" disabled={!canEdit} checked={form.ship_from_stock || false} onChange={e => setF('ship_from_stock', e.target.checked)} />
                  Use Sweden stock (skips production)
                </label>
                {form.ship_from_stock && canEdit && (
                  <button onClick={() => setShowStockPicker(true)} style={{ fontSize: 11, color: '#185FA5', background: '#E6F1FB', border: '1px solid #b3d4f5', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', width: 'fit-content' }}>
                    📦 Select from inventory
                  </button>
                )}
                {form.stock_item && (
                  <div style={{ fontSize: 11, color: '#27a069', background: '#f0faf5', border: '1px solid #9FE1CB', borderRadius: 6, padding: '5px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>✅ {form.stock_item.model} — {form.stock_item.type} — {form.stock_item.colour}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setShowStockPicker(true)} style={{ fontSize: 10, color: '#185FA5', background: 'none', border: '1px solid #b3d4f5', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>Change</button>
                      <button onClick={() => setF('stock_item', null)} style={{ fontSize: 10, color: '#E24B4A', background: 'none', border: '1px solid #f5b3b3', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>Remove</button>
                    </div>
                  </div>
                )}
              </div>
            </Field>
          </Row>
          <SectionLabel>Files (photos, documents, VIN images)</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
            {photos.length === 0 && <span style={{ fontSize: 12, color: '#aaa' }}>No files uploaded yet</span>}
            {photos.map((p, i) => {
              const name = p.name || ('file-' + (i+1))
              const ext = name.split('.').pop().toLowerCase()
              const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext)
              const isPDF = ext === 'pdf'
              return (
                <div key={i} style={{ position: 'relative', width: 90 }}>
                  <a href={p.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    {isImage
                      ? <img src={p.url} alt={name} style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6, border: '1px solid #e0ddd8', display: 'block' }} />
                      : <div style={{ width: 90, height: 90, borderRadius: 6, border: '1px solid #e0ddd8', background: '#f5f5f4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <span style={{ fontSize: 28 }}>{isPDF ? '📄' : '📎'}</span>
                          <span style={{ fontSize: 9, color: '#888', textAlign: 'center', padding: '0 4px', wordBreak: 'break-all' }}>{name.length > 12 ? name.slice(0,12)+'…' : name}</span>
                        </div>
                    }
                  </a>
                  <div style={{ fontSize: 9, color: '#666', marginTop: 3, textAlign: 'center', wordBreak: 'break-all' }}>{name.length > 14 ? name.slice(0,14)+'…' : name}</div>
                  <button onClick={() => handleDeletePhoto(p, i)} style={{ position: 'absolute', top: -6, right: -6, background: '#fff', border: '1px solid #e0ddd8', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', padding: 0 }}>✕</button>
                </div>
              )
            })}
          </div>
          <input ref={fileRef} type="file" accept="*/*" multiple style={{ display: 'none' }} onChange={handlePhotoUpload} />
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = '#f0f0f0'; e.currentTarget.style.borderColor = '#185FA5' }}
            onDragLeave={e => { e.currentTarget.style.background = '#fafaf9'; e.currentTarget.style.borderColor = '#ccc' }}
            onDrop={e => {
              e.preventDefault()
              e.currentTarget.style.background = '#fafaf9'
              e.currentTarget.style.borderColor = '#ccc'
              Array.from(e.dataTransfer.files).forEach(file => handlePhotoUpload({ target: { files: [file] } }))
            }}
            style={{ border: '1px dashed #ccc', borderRadius: 6, padding: 18, textAlign: 'center', fontSize: 12, color: '#888', cursor: 'pointer', background: '#fafaf9', transition: 'all 0.15s' }}>
            📎 Drag & drop files here, or click to upload<br/>
            <span style={{ fontSize: 10, color: '#bbb' }}>Images, PDFs, documents — any file type</span>
          </div>
          <SectionLabel>Customer and shipping</SectionLabel>
          <Row>
            <Field label="Customer name"><input value={form.customer_name || ''} onChange={e => setF('customer_name', e.target.value)} readOnly={!canEdit} /></Field>
            <Field label="Phone"><input value={form.phone || ''} onChange={e => setF('phone', e.target.value)} readOnly={!canEdit} placeholder="As provided by eBay" /></Field>
          </Row>
          <Row>
            <Field label="Email"><input value={form.email || ''} onChange={e => setF('email', e.target.value)} readOnly={!canEdit} /></Field>
            <Field label="Tracking number"><input value={form.tracking_number || ''} onChange={e => setF('tracking_number', e.target.value)} readOnly={!canEdit} placeholder="e.g. 1Z6V1294..." /></Field>
          </Row>
          <Field label="Shipping address">
            <textarea value={expandAddress(form.address || '').replace(/, /g, '\n')} onChange={e => setF('address', e.target.value.replace(/\n/g, ', '))} readOnly={!canEdit} style={{ minHeight: 80 }} placeholder={'Street\nCity\nPostcode\nCountry'} />
          </Field>
          <Row>
            <Field label="Source">
              <select value={form.source || ''} onChange={e => setF('source', e.target.value)} disabled={!canEdit}>
                {['Shopify', 'eBay', 'Manual'].map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Order date"><input type="date" value={form.order_date || ''} onChange={e => setF('order_date', e.target.value)} readOnly={!canEdit} /></Field>
          </Row>
          {canEdit && (
            <Field label="Move to stage">
              <select value={form.stage} onChange={e => setF('stage', e.target.value)}>
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          )}


        </div>
      )}

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

      {tab === 'Print / Export' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionLabel>Production sheet</SectionLabel>
          <div style={{ border: '1px solid #e0ddd8', borderRadius: 8, padding: 14, fontSize: 12, lineHeight: 1.9, background: '#fafaf9' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, borderBottom: '1px solid #e0ddd8', paddingBottom: 6 }}>Production sheet - {order.order_ref}</div>
            {[
              ['Order ID', order.order_ref],
              ['Date', fmtDate(order.order_date || order.created_at)],
              ['Customer', order.customer_name],
              ['Phone', order.phone],
              ['Email', order.email],
              ['Address', order.address],
              ['Car', order.car],
              ['VIN', order.vin || '-'],
              ['Position', (order.position || []).join(', ') || '-'],
              ['Material', order.material || '-'],
              ['Color / trim', order.color || '-'],
              ['Quantity', order.quantity || 1],
              ['Notes', order.notes || '-'],
              ['Status', order.stage],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                <span style={{ color: '#888', minWidth: 130 }}>{k}</span>
                <span style={{ fontFamily: k === 'VIN' ? 'monospace' : undefined }}>{v}</span>
              </div>
            ))}
          </div>
          <SectionLabel>Shipping label</SectionLabel>
          <div style={{ border: '2px solid #e0ddd8', borderRadius: 8, padding: 14, fontSize: 12, lineHeight: 1.9 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Shipping label - {order.order_ref}</div>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#888', minWidth: 60 }}>To</span><strong>{order.customer_name}</strong></div>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#888', minWidth: 60 }}>Address</span><span>{order.address}</span></div>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#888', minWidth: 60 }}>Phone</span><span>{order.phone}</span></div>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#888', minWidth: 60 }}>Email</span><span>{order.email}</span></div>
            <div style={{ border: '1px solid #e0ddd8', borderRadius: 6, padding: 10, marginTop: 10, background: '#f5f5f4' }}>
              <div style={{ fontWeight: 600 }}>{(order.position || []).join(', ')} — {order.material} — {order.color}</div>
              <div style={{ color: '#888', fontSize: 11 }}>{order.car}</div>
            </div>
            <div style={{ marginTop: 10, fontFamily: 'monospace', fontSize: 13, letterSpacing: 2, textAlign: 'center', padding: '6px', border: '1px solid #e0ddd8', borderRadius: 4 }}>{order.order_ref}</div>
          </div>
        </div>
      )}
      {showStockPicker && (
        <StockPicker
          onClose={() => setShowStockPicker(false)}
          onSelect={item => {
            setF('stock_item', item)
            setF('material', item.type)
            setF('color', item.colour)
            setF('car', form.car || item.model)
            setShowStockPicker(false)
            toast('Stock item selected — quantity will be decremented on save')
          }}
        />
      )}
    </Modal>
  )
}
