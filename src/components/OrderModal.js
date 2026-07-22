import { useState, useRef, useEffect } from 'react'
import Modal from './Modal'
import Btn from './Btn'
import StageProgress from './StageProgress'
import { STAGES, POSITION_OPTIONS, MATERIAL_OPTIONS } from '../lib/constants'
import StockPicker from './StockPicker'
import { updateOrder, uploadPhoto, deletePhoto, takeStock, returnStock, authHeaders, notifyWooShipped } from '../lib/api'
import { useToast } from './Toast'
import { getOrderItems, itemThumb } from '../lib/orderItems'
import { buildSheetHTML } from '../lib/productionSheet'
import { printPackingSlip } from '../lib/printPackingSlip'
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
// Parse an eBay-style title into spec fields (car / position / material / color).
function parseSpecFromTitle(title) {
  const t = title || ''
  const yearMatch = t.match(/\b((?:19|20)\d{2})(?:[\-–]((?:19|20)\d{2}))?\b/)
  const year = yearMatch ? yearMatch[0] : ''
  const makeModelMatch = t.match(/(?:For\s+)?(?:(?:19|20)\d{2}[\-–](?:19|20)\d{2}\s+)?([A-Z][\w\-]+(?:\s+[A-Z][\w\-]+){1,3})/i)
  const makeModel = makeModelMatch ? makeModelMatch[1].trim() : ''
  const car = makeModel && year ? `${makeModel} ${year}` : makeModel || t
  const positions = []
  if (/driver\s+bottom/i.test(t)) positions.push('Driver Bottom')
  if (/driver\s+top/i.test(t)) positions.push('Driver Top')
  if (/passenger\s+bottom/i.test(t)) positions.push('Passenger Bottom')
  if (/passenger\s+top/i.test(t)) positions.push('Passenger Top')
  let material = ''
  if (/leather\s+perf/i.test(t)) material = 'Leather perf'
  else if (/leather/i.test(t)) material = 'Leather'
  else if (/vinyl\s+perf/i.test(t)) material = 'Vinyl perf'
  else if (/vinyl/i.test(t)) material = 'Vinyl'
  else if (/alcantara/i.test(t)) material = 'Vinyl & Alcantara'
  else if (/cloth/i.test(t)) material = 'Cloth'
  let color = ''
  const colorMatch = t.match(/\b(black|grey|gray|beige|brown|red|blue|navy|tan|white|cream|camel|cognac|bordeaux)\b/i)
  if (colorMatch) color = colorMatch[1].charAt(0).toUpperCase() + colorMatch[1].slice(1).toLowerCase()
  return { car, positions, material, color }
}
export default function OrderModal({ order, onClose, onUpdated, role }) {
  const [tab, setTab] = useState('Details')
  const [form, setForm] = useState({ ...order })
  const [items, setItems] = useState(() => getOrderItems(order))
  const [saving, setSaving] = useState(false)
  const [showStockPicker, setShowStockPicker] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState(null)
  const [photos, setPhotos] = useState(order.photos || [])
  const [documents, setDocuments] = useState(order.documents || [])
  // Refs mirror the lists so concurrent uploads (multi-file drops fire several
  // async handlers at once) append to the latest list instead of a stale one.
  const photosRef = useRef(order.photos || [])
  const documentsRef = useRef(order.documents || [])
  const [initialForm] = useState({ ...order })
  const [initialItems] = useState(() => JSON.stringify(getOrderItems(order)))
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm) || JSON.stringify(items) !== initialItems
  const fileRef = useRef()
  const toast = useToast()
  const canEdit = role === 'admin' || role === 'sales' || role === 'production'
  const multi = items.length > 1
  function confirmClose() {
    if (isDirty) {
      if (window.confirm('You have unsaved changes. Are you sure you want to close?')) onClose()
    } else {
      onClose()
    }
  }
  const imagePhotos = photos.filter(p => {
    const ext = (p.name || '').split('.').pop().toLowerCase()
    return ['jpg','jpeg','png','gif','webp'].includes(ext) && p.url
  })
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') {
        if (lightboxIdx !== null) setLightboxIdx(null)
        else confirmClose()
      }
      if (lightboxIdx !== null) {
        if (e.key === 'ArrowRight') setLightboxIdx(i => Math.min(i + 1, imagePhotos.length - 1))
        if (e.key === 'ArrowLeft') setLightboxIdx(i => Math.max(i - 1, 0))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightboxIdx, onClose, imagePhotos.length, isDirty])
  function setF(k, v) { setForm(prev => ({ ...prev, [k]: v })) }
  function setItem(i, patch) { setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it)) }
  const COUNTRY_NAMES = { GB: 'United Kingdom', DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain', NL: 'Netherlands', BE: 'Belgium', AT: 'Austria', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland', PL: 'Poland', PT: 'Portugal', IE: 'Ireland', CH: 'Switzerland', US: 'United States', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand', JP: 'Japan', IS: 'Iceland', HU: 'Hungary', GR: 'Greece', CZ: 'Czechia', SK: 'Slovakia', SI: 'Slovenia', HR: 'Croatia', RO: 'Romania', BG: 'Bulgaria', LU: 'Luxembourg', EE: 'Estonia', LV: 'Latvia', LT: 'Lithuania', MT: 'Malta', CY: 'Cyprus' }
  const NAME_TO_CODE = Object.fromEntries(Object.entries(COUNTRY_NAMES).map(([code, name]) => [name.toLowerCase(), code]))
  // The stored address stays canonical: it must END in the 2-letter ISO code
  // UPS needs. A hand-typed country name ("United Kingdom") is converted to
  // its code on save; the full name is only ever shown as a hint.
  function normalizeAddressCountry(addr) {
    const trimmed = (addr || '').trim()
    const m = trimmed.match(/,\s*([^,]+)$/)
    const code = m && NAME_TO_CODE[m[1].trim().toLowerCase()]
    return code ? trimmed.replace(/,\s*[^,]+$/, ', ' + code) : addr
  }
  const addrTail = ((form.address || '').trim().match(/,\s*([^,]+)$/) || [])[1]?.trim() || ''
  const tailCode = /^[A-Za-z]{2}$/.test(addrTail) ? addrTail.toUpperCase() : NAME_TO_CODE[addrTail.toLowerCase()]
  const countryHint = tailCode ? (COUNTRY_NAMES[tailCode] || tailCode) : ''
  function parseItem(i) {
    const it = items[i]
    const { car, positions, material, color } = parseSpecFromTitle(it.car || it.title || '')
    setItem(i, {
      car: car || it.car,
      position: positions.length > 0 ? positions : it.position,
      material: material || it.material,
      color: color || it.color,
    })
  }
  async function save(advanceStage = false) {
    setSaving(true)
    try {
      // Keep order-level convenience fields synced to the primary item so list
      // views, templates and packing-slip fallbacks stay correct.
      const primary = items[0] || {}
      const sumQty = items.reduce((n, it) => n + (Number(it.quantity) || 0), 0) || 1
      let updates = {
        ...form, items, photos, documents,
        address: normalizeAddressCountry(form.address),
        car: primary.car || primary.title || form.car,
        thumbnail: primary.custom_thumbnail || primary.thumbnail || form.thumbnail,
        quantity: sumQty,
        vin: primary.vin || '',
        year: primary.year || '',
        position: primary.position || [],
        position_other: primary.position_other || '',
        material: primary.material || '',
        color: primary.color || '',
      }
      // Jump a NEWLY-flagged stock order past production — but never pull an
      // order backwards that is already at/after Shipped to Sweden, and never
      // override the manual "Move to stage" select on later saves.
      const shipIdx = STAGES.indexOf('Shipped to Sweden')
      if (updates.ship_from_stock && !order.ship_from_stock && STAGES.indexOf(updates.stage) < shipIdx) {
        updates.stage = 'Shipped to Sweden'
      } else if (advanceStage) {
        const idx = STAGES.indexOf(form.stage)
        if (idx < STAGES.length - 1) updates.stage = STAGES[idx + 1]
      }
      // Stock moves on SAVE: take the newly-picked unit (atomic — throws if out
      // of stock), and return a previously-reserved one if the pick changed.
      const prevStockId = order.stock_item?.id || null
      const newStockId = form.stock_item?.id || null
      if (newStockId !== prevStockId) {
        if (newStockId) await takeStock(newStockId)
        if (prevStockId) await returnStock(prevStockId)
      }
      // Write only fields that actually changed, so two people editing the same
      // order (or the eBay sync writing refunds) don't clobber each other.
      const changed = {}
      for (const k of Object.keys(updates)) {
        if (JSON.stringify(updates[k] ?? null) !== JSON.stringify(order[k] ?? null)) changed[k] = updates[k]
      }
      if (Object.keys(changed).length > 0) {
        const updated = await updateOrder(order.id, changed)
        onUpdated(updated)
        toast(advanceStage ? `Advanced to "${updates.stage}"` : 'Order saved')
      }
      if (order.source === 'eBay' && changed.tracking_number) {
        fetch('/api/ebay-tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ orderId: order.order_ref, trackingNumber: changed.tracking_number })
        }).catch(() => {})
      }
      if (changed.stage) {
        notifyWooShipped({ ...order, ...changed }, changed.stage)
      }
      onClose()
    } catch (e) {
      toast(e.message, 'error')
    }
    setSaving(false)
  }
  async function compressImage(file, maxWidth = 1200, quality = 0.75) {
    return new Promise(resolve => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url)
          resolve(new File([blob], file.name, { type: 'image/jpeg' }))
        }, 'image/jpeg', quality)
      }
      img.src = url
    })
  }
  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    for (let file of files) {
      try {
        const ext = file.name.split('.').pop().toLowerCase()
        if (['jpg','jpeg','png','webp'].includes(ext)) {
          file = await compressImage(file)
        }
        const { path, url } = await uploadPhoto(order.id, file)
        photosRef.current = [...photosRef.current, { path, url, name: file.name }]
        setPhotos(photosRef.current)
        await updateOrder(order.id, { photos: photosRef.current })
        toast(`${file.name} uploaded`)
      } catch (err) {
        toast(err.message, 'error')
      }
    }
  }
  // Replace one item's thumbnail with an uploaded image (custom override).
  async function handleItemThumb(i, file) {
    if (!file) return
    try {
      let f = file
      const ext = file.name.split('.').pop().toLowerCase()
      if (['jpg','jpeg','png','webp'].includes(ext)) f = await compressImage(file)
      const { url } = await uploadPhoto(order.id, f)
      setItem(i, { custom_thumbnail: url })
      toast('Thumbnail replaced — save to keep')
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  async function handleDocUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    for (let file of files) {
      try {
        const ext = file.name.split('.').pop().toLowerCase()
        if (['jpg','jpeg','png','webp'].includes(ext)) {
          file = await compressImage(file)
        }
        const { path, url } = await uploadPhoto(order.id, file)
        documentsRef.current = [...documentsRef.current, { path, url, name: file.name }]
        setDocuments(documentsRef.current)
        await updateOrder(order.id, { documents: documentsRef.current })
        toast(file.name + ' uploaded')
      } catch (err) {
        toast(err.message, 'error')
      }
    }
  }
  async function handleDeleteDoc(doc, idx) {
    try {
      if (doc.path) await deletePhoto(doc.path)
      const updated = documents.filter((_, i) => i !== idx)
      documentsRef.current = updated
      setDocuments(updated)
      await updateOrder(order.id, { documents: updated })
      toast('Document removed')
    } catch (err) {
      toast(err.message, 'error')
    }
  }
  async function handleDeletePhoto(photo, idx) {
    try {
      if (photo.path) await deletePhoto(photo.path)
      const newPhotos = photos.filter((_, i) => i !== idx)
      photosRef.current = newPhotos
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
  // Product lines come from the real items — never from stale order-level
  // fields (order.seats was hardcoded by the sync and undefined on manual orders).
  const itemLines = items.map(it => `- ${(Number(it.quantity) || 1) > 1 ? it.quantity + ' × ' : ''}${it.car || it.title || 'Seat covers'}${it.material ? ', ' + it.material : ''}${it.color ? ', ' + it.color : ''}`).join('\n')
  const verifyTpl = `Hi ${firstName},\n\nWe have received your order ${order.order_ref}:\n${itemLines}\n\nTo proceed, please send us:\n1. A photo of your car interior (showing the seats)\n2. A photo of your VIN plate\n\nYou can reply directly to this email or send via WhatsApp.\n\nThanks,\nSeatCover Team`
  const shipTpl = `Hi ${firstName},\n\nGreat news - your order ${order.order_ref} has been shipped!\n\n${itemLines}\n\nYou will receive a tracking number shortly.\n\nThanks,\nSeatCover Team`
  const smsTpl = `SeatCover: Your order ${order.order_ref} is confirmed. We will contact you shortly about verification. Reply STOP to opt out.`
  const waTpl = `Hi ${firstName}! Your SeatCover order *${order.order_ref}* is confirmed!\n\nWe need a couple of photos to get started:\n- Your car interior (seats)\n- Your VIN plate\n\nThanks!`
  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard')).catch(() => toast('Copy failed', 'error'))
  }
  // The real workshop sheet (no customer contact info, no prices) — same
  // shared builder used by the Production and Verified pages.
  function printProductionSheet() {
    const w = window.open('', '_blank')
    if (!w) { toast('Popup blocked — allow popups to print', 'error'); return }
    w.document.write('<html><head><title>Production Sheet</title><style>* { box-sizing: border-box; } body { font-family: Arial, sans-serif; padding: 24px; font-size: 13px; } @media print { button { display: none } }</style></head><body>' + buildSheetHTML({ ...order, items, notes: form.notes, photos }) + '<button onclick="window.print()">Print</button></body></html>')
    w.document.close()
  }
  function fmtDate(d) { return d ? d.slice(0, 10).split('-').reverse().join('/') : '-' }
  const footer = tab === 'Details' && canEdit ? (
    <>
      <Btn onClick={confirmClose}>Cancel</Btn>
      <Btn onClick={() => save(false)} disabled={saving}>Save</Btn>
      {canAdvance && <Btn onClick={() => save(true)} disabled={saving} variant="primary">Save & advance</Btn>}
    </>
  ) : tab === 'Print / Export' ? (
    <>
      <Btn onClick={confirmClose}>Close</Btn>
      <Btn onClick={printProductionSheet} variant="success">Print production sheet</Btn>
      <Btn onClick={() => printPackingSlip({ ...order, items, notes: form.notes })} variant="primary">Print packing slip</Btn>
    </>
  ) : <Btn onClick={confirmClose}>Close</Btn>
  return (
    <Modal title={`${order.order_ref} - ${order.customer_name}`} onClose={confirmClose} footer={footer} wide>
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
          {/* Order summary strip */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', background: '#f9f9f8', borderRadius: 8, padding: '8px 12px', border: '1px solid #e0ddd8', fontSize: 11, color: '#555', flexWrap: 'wrap' }}>
            {order.sale_amount != null && <span>💰 <strong>{order.sale_currency} {order.sale_amount}</strong>{order.refund_amount > 0 ? <span style={{ color: '#E24B4A', marginLeft: 6 }}>− {order.sale_currency} {order.refund_amount} refund</span> : ''}</span>}
            {order.tracking_number && <a href={'https://www.ups.com/track?tracknum=' + order.tracking_number} target='_blank' rel='noreferrer' style={{ color: '#185FA5', textDecoration: 'none' }}>📦 {order.tracking_number}</a>}
            {order.source === 'eBay' && order.order_ref && <a href={'https://www.ebay.co.uk/mesh/ord/details?orderid=' + order.order_ref} target='_blank' rel='noreferrer' style={{ color: '#185FA5', textDecoration: 'none' }}>View eBay order →</a>}
          </div>
          {multi && (
            <div style={{ background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 700, color: '#92400E' }}>⚠ MULTI-ITEM ORDER — {items.length} items, each with its own spec. ALL produced &amp; shipped together.</div>
          )}
          <SectionLabel>{multi ? `Items (${items.length}) — vehicle & product` : 'Vehicle and product'}</SectionLabel>
          {items.map((it, i) => {
            const displayThumb = itemThumb(it)
            return (
              <div key={i} style={{ border: '1px solid #e0ddd8', borderRadius: 8, padding: 12, background: multi ? '#fcfcfb' : 'transparent', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {multi && <div style={{ fontSize: 12, fontWeight: 700, color: '#185FA5' }}>Item {i + 1} of {items.length}</div>}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ flexShrink: 0, width: 130 }}>
                    <div
                      onDragOver={e => { if (!canEdit) return; e.preventDefault(); e.currentTarget.style.opacity = '0.7' }}
                      onDragLeave={e => { e.currentTarget.style.opacity = '1' }}
                      onDrop={e => { if (!canEdit) return; e.preventDefault(); e.currentTarget.style.opacity = '1'; const f = e.dataTransfer.files[0]; if (f) handleItemThumb(i, f) }}
                      onClick={() => { if (!canEdit) return; const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = e => handleItemThumb(i, e.target.files[0]); inp.click() }}
                      style={{ position: 'relative', width: 130, height: 130, cursor: canEdit ? 'pointer' : 'default', borderRadius: 6, overflow: 'hidden', border: '2px dashed #ccc' }}>
                      {displayThumb
                        ? <img src={displayThumb} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.target.style.display = 'none' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#aaa', textAlign: 'center', padding: 4 }}>Drop image here</div>}
                      {canEdit && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 9, textAlign: 'center', padding: '2px 0' }}>Click / drop to replace</div>}
                    </div>
                    {it.custom_thumbnail && (
                      <div style={{ fontSize: 10, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: '#27a069' }}>✓ custom</span>
                        {canEdit && <button onClick={() => setItem(i, { custom_thumbnail: '' })} style={{ fontSize: 10, color: '#185FA5', background: 'none', border: '1px solid #b3d4f5', borderRadius: 4, padding: '1px 5px', cursor: 'pointer' }}>revert to eBay</button>}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {it.title && (
                      <div style={{ fontSize: 11, color: '#888' }}>{it.title}
                        {it.item_id && <a href={'https://www.ebay.co.uk/itm/' + it.item_id} target='_blank' rel='noreferrer' style={{ marginLeft: 8, color: '#185FA5', textDecoration: 'none' }}>listing →</a>}
                        {it.sku && <span style={{ marginLeft: 8, color: '#bbb' }}>SKU {it.sku}</span>}
                      </div>
                    )}
                    <Row>
                      <Field label="Car (make / model / year)">
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input value={it.car || ''} onChange={e => setItem(i, { car: e.target.value })} readOnly={!canEdit} style={{ flex: 1 }} />
                          {canEdit && <button onClick={() => parseItem(i)} style={{ fontSize: 11, color: '#185FA5', background: '#E6F1FB', border: '1px solid #b3d4f5', borderRadius: 6, padding: '0 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>⚡ Parse</button>}
                        </div>
                      </Field>
                      <Field label="VIN number"><input value={it.vin || ''} onChange={e => setItem(i, { vin: e.target.value })} style={{ fontFamily: 'monospace', fontSize: 11 }} readOnly={!canEdit} /></Field>
                    </Row>
                    <Row>
                      <Field label="Year (specific)"><input value={it.year || ''} onChange={e => setItem(i, { year: e.target.value })} readOnly={!canEdit} placeholder="e.g. 2019" style={{ width: 100 }} /></Field>
                      <Field label="Quantity"><input type="number" min="1" value={it.quantity || 1} onChange={e => setItem(i, { quantity: parseInt(e.target.value) || 1 })} readOnly={!canEdit} style={{ width: 80 }} /></Field>
                    </Row>
                    <Field label="Position (select all that apply)">
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {POSITION_OPTIONS.map(p => (
                          <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: canEdit ? 'pointer' : 'default' }}>
                            <input type="checkbox" disabled={!canEdit}
                              checked={(it.position || []).includes(p)}
                              onChange={e => { const cur = it.position || []; setItem(i, { position: e.target.checked ? [...cur, p] : cur.filter(x => x !== p) }) }} />
                            {p}
                          </label>
                        ))}
                      </div>
                      {(it.position || []).includes('Other') && (
                        <input value={it.position_other || ''} onChange={e => setItem(i, { position_other: e.target.value })} readOnly={!canEdit} placeholder="Describe other position..." style={{ marginTop: 6, width: '100%' }} />
                      )}
                    </Field>
                    <Row>
                      <Field label="Material">
                        <select value={it.material || ''} onChange={e => setItem(i, { material: e.target.value })} disabled={!canEdit}>
                          <option value="">— select —</option>
                          {MATERIAL_OPTIONS.map(m => <option key={m}>{m}</option>)}
                        </select>
                      </Field>
                      <Field label="Color + trim code"><input value={it.color || ''} onChange={e => setItem(i, { color: e.target.value })} readOnly={!canEdit} placeholder="e.g. Black 040" /></Field>
                    </Row>
                    <Field label="Item production note"><input value={it.item_notes || ''} onChange={e => setItem(i, { item_notes: e.target.value })} readOnly={!canEdit} placeholder="Anything specific to this item" /></Field>
                  </div>
                </div>
              </div>
            )
          })}
          <Field label="Order production notes">
            <textarea value={form.notes || ''} onChange={e => setF('notes', e.target.value)} readOnly={!canEdit} style={{ minHeight: 44, background: form.notes ? '#FFFBEB' : '', border: form.notes ? '1px solid #F59E0B' : '', borderRadius: 4 }} placeholder={multi ? 'Notes for the WHOLE order (per-item notes live on each item above)' : 'Notes for the whole order'} />
          </Field>
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
          <SectionLabel>Seat cover photos & VIN images</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
            {photos.length === 0 && <span style={{ fontSize: 12, color: '#aaa' }}>No photos uploaded yet</span>}
            {photos.map((p, i) => {
              const name = p.name || ('photo-' + (i+1))
              const ext = name.split('.').pop().toLowerCase()
              const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext)
              return (
                <div key={i} style={{ position: 'relative', width: 90 }}>
                  <a href={p.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    {isImage
                      ? <img src={p.url} alt={name} onClick={e => { e.preventDefault(); setLightboxIdx(imagePhotos.findIndex(x => x.url === p.url)) }} style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6, border: '1px solid #e0ddd8', display: 'block', cursor: 'zoom-in' }} />
                      : <div style={{ width: 90, height: 90, borderRadius: 6, border: '1px solid #e0ddd8', background: '#f5f5f4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <span style={{ fontSize: 28 }}>🖼</span>
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
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoUpload} />
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
            style={{ border: '1px dashed #ccc', borderRadius: 6, padding: 14, textAlign: 'center', fontSize: 12, color: '#888', cursor: 'pointer', background: '#fafaf9', transition: 'all 0.15s' }}>
            🖼 Drag & drop photos here, or click to upload
          </div>
          <SectionLabel>Documents</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
            {documents.length === 0 && <span style={{ fontSize: 12, color: '#aaa' }}>No documents uploaded yet</span>}
            {documents.map((d, i) => {
              const name = d.name || ('doc-' + (i+1))
              const ext = name.split('.').pop().toLowerCase()
              const isPDF = ext === 'pdf'
              return (
                <div key={i} style={{ position: 'relative', width: 90 }}>
                  <a href={d.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    <div style={{ width: 90, height: 90, borderRadius: 6, border: '1px solid #e0ddd8', background: '#f5f5f4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <span style={{ fontSize: 28 }}>{isPDF ? '📄' : '📎'}</span>
                      <span style={{ fontSize: 9, color: '#888', textAlign: 'center', padding: '0 4px', wordBreak: 'break-all' }}>{name.length > 12 ? name.slice(0,12)+'…' : name}</span>
                    </div>
                  </a>
                  <div style={{ fontSize: 9, color: '#666', marginTop: 3, textAlign: 'center', wordBreak: 'break-all' }}>{name.length > 14 ? name.slice(0,14)+'…' : name}</div>
                  <button onClick={() => handleDeleteDoc(d, i)} style={{ position: 'absolute', top: -6, right: -6, background: '#fff', border: '1px solid #e0ddd8', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', padding: 0 }}>✕</button>
                </div>
              )
            })}
          </div>
          <div
            onClick={() => { const inp = document.createElement('input'); inp.type='file'; inp.accept='.pdf,.doc,.docx,.xls,.xlsx'; inp.multiple=true; inp.onchange=e=>handleDocUpload(e); inp.click() }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = '#f0f0f0'; e.currentTarget.style.borderColor = '#185FA5' }}
            onDragLeave={e => { e.currentTarget.style.background = '#fafaf9'; e.currentTarget.style.borderColor = '#ccc' }}
            onDrop={e => {
              e.preventDefault()
              e.currentTarget.style.background = '#fafaf9'
              e.currentTarget.style.borderColor = '#ccc'
              Array.from(e.dataTransfer.files).forEach(file => handleDocUpload({ target: { files: [file] } }))
            }}
            style={{ border: '1px dashed #ccc', borderRadius: 6, padding: 14, textAlign: 'center', fontSize: 12, color: '#888', cursor: 'pointer', background: '#fafaf9', transition: 'all 0.15s' }}>
            📎 Drag & drop documents here, or click to upload
          </div>
          <Field label="Order number">
            <input value={form.order_ref || ''} onChange={e => setF('order_ref', e.target.value)} readOnly={!canEdit} style={{ fontFamily: 'monospace' }} />
          </Field>
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
            <textarea value={(form.address || '').replace(/, /g, '\n')} onChange={e => setF('address', e.target.value.replace(/\n/g, ', '))} readOnly={!canEdit} style={{ minHeight: 80 }} placeholder={'Street\nCity\nPostcode\nCountry code (e.g. GB)'} />
            {countryHint && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Country: {countryHint} — saved as the 2-letter code ({tailCode}) for UPS</div>}
          </Field>
          <Row>
            <Field label="Source">
              <select value={form.source || ''} onChange={e => setF('source', e.target.value)} disabled={!canEdit}>
                {['Website', 'eBay', 'Manual'].map(s => <option key={s}>{s}</option>)}
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
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, borderBottom: '1px solid #e0ddd8', paddingBottom: 6 }}>Production sheet - {order.order_ref}{multi ? ` — ${items.length} items` : ''}</div>
            {[
              ['Order ID', order.order_ref],
              ['Date', fmtDate(order.order_date || order.created_at)],
              ['Customer', order.customer_name],
              ['Phone', order.phone],
              ['Email', order.email],
              ['Address', order.address],
              ['Status', order.stage],
              ['Order notes', order.notes || '-'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                <span style={{ color: '#888', minWidth: 130 }}>{k}</span>
                <span>{v}</span>
              </div>
            ))}
            {items.map((it, i) => (
              <div key={i} style={{ border: '1px solid #e0ddd8', borderRadius: 6, padding: 10, marginTop: 10, background: '#fff' }}>
                {multi && <div style={{ fontWeight: 700, color: '#185FA5', marginBottom: 4 }}>Item {i + 1} of {items.length}</div>}
                <div style={{ display: 'flex', gap: 10 }}>
                  {itemThumb(it) && <img src={itemThumb(it)} alt="" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 4, border: '1px solid #e0ddd8', flexShrink: 0 }} />}
                  <div style={{ flex: 1 }}>
                    {[
                      ['Car', it.car || it.title || '-'],
                      ['VIN', it.vin || '-'],
                      ['Year', it.year || '-'],
                      ['Position', (it.position || []).concat(it.position_other ? [it.position_other] : []).join(', ') || '-'],
                      ['Material', it.material || '-'],
                      ['Color / trim', it.color || '-'],
                      ['Quantity', it.quantity || 1],
                      ['Note', it.item_notes || '-'],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                        <span style={{ color: '#888', minWidth: 110 }}>{k}</span>
                        <span style={{ fontFamily: k === 'VIN' ? 'monospace' : undefined }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {(order.photos || []).filter(p => ['jpg','jpeg','png','gif','webp'].includes((p.name||'').split('.').pop().toLowerCase()) && p.url).length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ color: '#888', fontSize: 11, marginBottom: 6 }}>Customer photos</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {order.photos.filter(p => ['jpg','jpeg','png','gif','webp'].includes((p.name||'').split('.').pop().toLowerCase()) && p.url).map((p, i) => (
                    <img key={i} src={p.url} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 6, border: '1px solid #e0ddd8' }} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <SectionLabel>Shipping label</SectionLabel>
          <div style={{ border: '2px solid #e0ddd8', borderRadius: 8, padding: 14, fontSize: 12, lineHeight: 1.9 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Shipping label - {order.order_ref}</div>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#888', minWidth: 60 }}>To</span><strong>{order.customer_name}</strong></div>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#888', minWidth: 60 }}>Address</span><span>{order.address}</span></div>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#888', minWidth: 60 }}>Phone</span><span>{order.phone}</span></div>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#888', minWidth: 60 }}>Email</span><span>{order.email}</span></div>
            {items.map((it, i) => (
              <div key={i} style={{ border: '1px solid #e0ddd8', borderRadius: 6, padding: 10, marginTop: 10, background: '#f5f5f4' }}>
                <div style={{ fontWeight: 600 }}>{(it.position || []).join(', ')}{it.material ? ` — ${it.material}` : ''}{it.color ? ` — ${it.color}` : ''}</div>
                <div style={{ color: '#888', fontSize: 11 }}>{it.car || it.title}{(it.quantity || 1) > 1 ? ` ×${it.quantity}` : ''}</div>
              </div>
            ))}
            <div style={{ marginTop: 10, fontFamily: 'monospace', fontSize: 13, letterSpacing: 2, textAlign: 'center', padding: '6px', border: '1px solid #e0ddd8', borderRadius: 4 }}>{order.order_ref}</div>
          </div>
        </div>
      )}
      {lightboxIdx !== null && imagePhotos[lightboxIdx] && (
        <div onClick={() => setLightboxIdx(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ position: 'absolute', top: 20, right: 24, color: '#fff', fontSize: 28, cursor: 'pointer' }} onClick={() => setLightboxIdx(null)}>✕</div>
          {lightboxIdx > 0 && <div onClick={e => { e.stopPropagation(); setLightboxIdx(i => i - 1) }} style={{ position: 'absolute', left: 24, color: '#fff', fontSize: 40, cursor: 'pointer', userSelect: 'none' }}>‹</div>}
          <img src={imagePhotos[lightboxIdx].url} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()} />
          {lightboxIdx < imagePhotos.length - 1 && <div onClick={e => { e.stopPropagation(); setLightboxIdx(i => i + 1) }} style={{ position: 'absolute', right: 24, color: '#fff', fontSize: 40, cursor: 'pointer', userSelect: 'none' }}>›</div>}
          <div style={{ position: 'absolute', bottom: 20, color: '#aaa', fontSize: 12 }}>{lightboxIdx + 1} / {imagePhotos.length}</div>
        </div>
      )}
      {showStockPicker && (
        <StockPicker
          onClose={() => setShowStockPicker(false)}
          onSelect={stockItem => {
            setItem(0, { material: stockItem.type, color: stockItem.colour, car: items[0]?.car || stockItem.model })
            setF('stock_item', stockItem)
            setShowStockPicker(false)
            toast('Stock item selected — quantity will be decremented on save')
          }}
        />
      )}
    </Modal>
  )
}
