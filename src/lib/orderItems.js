// Multi-item order support. An eBay order is a cart of independent line items;
// each item is its OWN production job with its own vehicle/product spec and its
// own thumbnail. Orders carry an `items` jsonb array. Orders created before the
// multi-item work (or manual orders) don't — getOrderItems() synthesizes a
// single item from the legacy order-level fields so every screen is uniform.

export const EMPTY_ITEM = {
  // eBay identity (set by sync, not edited)
  title: '', item_id: '', sku: '', quantity: 1, price: null, currency: '',
  // two thumbnails: eBay original + optional operator override
  thumbnail: '', custom_thumbnail: '',
  // per-item production spec (editable)
  car: '', vin: '', year: '', position: [], position_other: '',
  material: '', color: '', item_notes: '',
}

function normPosition(p) {
  if (Array.isArray(p)) return p
  return p ? [p] : []
}

export function getOrderItems(o) {
  if (Array.isArray(o?.items) && o.items.length > 0) {
    return o.items.map(it => ({ ...EMPTY_ITEM, ...it, position: normPosition(it.position) }))
  }
  // Legacy single-item order — build one item from the flat order fields.
  return [{
    ...EMPTY_ITEM,
    title: o?.car || '',
    quantity: o?.quantity || 1,
    price: o?.sale_amount != null ? Number(o.sale_amount) : null,
    currency: o?.sale_currency || '',
    item_id: o?.ebay_item_id || '',
    thumbnail: o?.thumbnail || '',
    custom_thumbnail: o?.custom_thumbnail || '',
    car: o?.car || '',
    vin: o?.vin || '',
    year: o?.year || '',
    position: normPosition(o?.position),
    position_other: o?.position_other || '',
    material: o?.material || '',
    color: o?.color || '',
  }]
}

export function isMultiItem(o) {
  return Array.isArray(o?.items) && o.items.length > 1
}

// Display thumbnail = operator override if set, else the eBay original.
export function itemThumb(it) {
  return (it?.custom_thumbnail || it?.thumbnail || '')
}
