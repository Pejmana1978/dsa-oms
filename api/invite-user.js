import { requireAdmin } from './_auth.js'

// Invites must run server-side: inviteUserByEmail needs the service-role key,
// which can never ship in the browser bundle.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const admin = await requireAdmin(req, res)
  if (!admin) return
  const { email, fullName, role } = req.body || {}
  if (!email || !fullName) return res.status(400).json({ error: 'Email and name are required' })
  try {
    const r = await fetch(process.env.REACT_APP_SUPABASE_URL + '/auth/v1/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ email, data: { full_name: fullName, role: role || 'sales' } }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(400).json({ error: data?.msg || data?.error_description || 'Invite failed' })
    return res.status(200).json({ success: true })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
