// US/Canada website orders are fulfilled by the US team (Juan) in ShipStation.
// They live in this OMS only as a safeguard: the whole point is that an order
// nobody shipped stays visible and gets louder, instead of disappearing.

export const OVERDUE_DAYS = 5

export const US_STATUS_LABELS = {
  received: 'Received',
  sent: 'Sent to Juan',
  shipped: 'Shipped',
}

export function isUsTeamOrder(o) {
  return o?.fulfillment_team === 'us_team'
}

/** Orders the US team still has to ship (excludes archived/refunded). */
export function openUsOrders(orders) {
  return (orders || []).filter(o => isUsTeamOrder(o) && !o.archived && o.us_status !== 'shipped')
}

/** Whole days since the order was placed. */
export function daysWaiting(o) {
  const start = o?.order_date || o?.created_at
  if (!start) return 0
  const ms = Date.now() - new Date(start).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}

export function isOverdue(o, limit = OVERDUE_DAYS) {
  return daysWaiting(o) >= limit
}

/** Count for the sidebar badge — overdue first, else simply what's open. */
export function usAlertCount(orders, limit = OVERDUE_DAYS) {
  return openUsOrders(orders).filter(o => isOverdue(o, limit)).length
}
