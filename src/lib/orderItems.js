// Multi-item order support. eBay-synced orders carry an `items` jsonb array
// ([{ title, quantity, price, currency, item_id, sku, thumbnail }]); orders
// created before the multi-item fix (or manual orders) don't — fall back to
// the legacy single-item fields so every caller can treat orders uniformly.

export function getOrderItems(o) {
  if (Array.isArray(o?.items) && o.items.length > 0) return o.items
  return [{
    title: o?.car || '',
    quantity: o?.quantity || 1,
    price: o?.sale_amount != null ? Number(o.sale_amount) : null,
    currency: o?.sale_currency || '',
    item_id: o?.ebay_item_id || '',
    sku: '',
    thumbnail: o?.thumbnail || '',
  }]
}

export function isMultiItem(o) {
  return Array.isArray(o?.items) && o.items.length > 1
}
