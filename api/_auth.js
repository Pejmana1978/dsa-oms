// Shared auth for the Vercel API routes. Every route must call requireUser()
// (or requireAdmin()) before doing anything — these endpoints spend real money
// (UPS) and write to the live eBay account, so they can never be open.
// The client sends the user's Supabase access token as a Bearer header;
// we validate it against Supabase Auth.

export async function getAuthedUser(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  try {
    const res = await fetch(process.env.REACT_APP_SUPABASE_URL + '/auth/v1/user', {
      headers: {
        apikey: process.env.REACT_APP_SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + token,
      },
    })
    if (!res.ok) return null
    const user = await res.json()
    return user?.id ? user : null
  } catch {
    return null
  }
}

export async function requireUser(req, res) {
  const user = await getAuthedUser(req)
  if (!user) {
    res.status(401).json({ error: 'Not signed in' })
    return null
  }
  return user
}

export async function requireAdmin(req, res) {
  const user = await requireUser(req, res)
  if (!user) return null
  try {
    const r = await fetch(
      `${process.env.REACT_APP_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
      }
    )
    const rows = await r.json()
    if (rows?.[0]?.role === 'admin') return user
  } catch {}
  res.status(403).json({ error: 'Admin only' })
  return null
}
