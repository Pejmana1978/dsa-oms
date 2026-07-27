import { supabase } from './supabase'

// The /api/* Vercel routes require a signed-in user — send the session token.
export async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: 'Bearer ' + token } : {}
}

export async function fetchOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('order_date', { ascending: false })
  if (error) throw error
  return data
}

export async function createOrder(order) {
  const { data, error } = await supabase
    .from('orders')
    .insert([order])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateOrder(id, updates) {
  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteOrder(id) {
  const { error } = await supabase.from('orders').delete().eq('id', id)
  if (error) throw error
}

export async function uploadPhoto(orderId, file) {
  const ext = file.name.split('.').pop()
  const path = `${orderId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('order-photos').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('order-photos').getPublicUrl(path)
  return { path, url: data.publicUrl }
}

export async function deletePhoto(path) {
  const { error } = await supabase.storage.from('order-photos').remove([path])
  if (error) throw error
}

export async function fetchProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name')
  if (error) throw error
  return data
}

export async function inviteUser(email, fullName, role) {
  const res = await fetch('/api/invite-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ email, fullName, role })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Invite failed')
  return data
}

export async function updateProfile(id, updates) {
  const { data, error } = await supabase.from('profiles').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

// Mark a WEBSITE order Completed in WooCommerce with a customer-visible
// tracking note. Called the moment the parcel is genuinely on its way:
//   EU orders    — when the UPS label is created
//   US/CA orders — when Juan's tracking number is entered
// Fire-and-forget, and idempotent server-side (orders.woo_completed_at), so
// calling it more than once is harmless and a Woo hiccup never blocks the OMS.
export function markWooCompleted(order, trackingNumber) {
  if (order?.source !== 'Website' || !order?.woo_order_id || order?.woo_completed_at) return
  authHeaders().then(h =>
    fetch('/api/woo-shipped', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...h },
      body: JSON.stringify({
        orderId: order.id,
        wooOrderId: order.woo_order_id,
        trackingNumber: trackingNumber || order.tracking_number || '',
      })
    })
  ).catch(() => {})
}

// Fallback for orders dispatched without an OMS-created label (e.g. another
// carrier): completing the stage still closes the WooCommerce order.
export function notifyWooShipped(order, newStage) {
  if (newStage !== 'Shipped to Customer') return
  markWooCompleted(order)
}

export async function fetchStock() {
  const { data, error } = await supabase.from('stock').select('*').order('model').order('type').order('colour')
  if (error) throw error
  return data
}

// Atomic in the database (single conditional UPDATE) — two users can't both
// take the last unit, and cancelling a pick returns the unit.
export async function takeStock(id) {
  const { data, error } = await supabase.rpc('take_stock', { stock_id: id })
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Item out of stock')
  return data[0]
}

export async function returnStock(id) {
  const { data, error } = await supabase.rpc('return_stock', { stock_id: id })
  if (error) throw error
  return data?.[0]
}
