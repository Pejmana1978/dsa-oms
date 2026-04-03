import { supabase } from './supabase'

export async function fetchOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
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
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role }
  })
  if (error) throw error
  return data
}

export async function updateProfile(id, updates) {
  const { data, error } = await supabase.from('profiles').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function fetchStock() {
  const { data, error } = await supabase.from('stock').select('*').order('model').order('type').order('colour')
  if (error) throw error
  return data
}

export async function decrementStock(id) {
  const { data: item } = await supabase.from('stock').select('quantity').eq('id', id).single()
  if (!item || item.quantity <= 0) throw new Error('Item out of stock')
  const { data, error } = await supabase.from('stock').update({ quantity: item.quantity - 1 }).eq('id', id).select().single()
  if (error) throw error
  return data
}
