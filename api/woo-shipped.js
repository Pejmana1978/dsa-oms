import { requireUser } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!(await requireUser(req, res))) return
  const { wooOrderId, trackingNumber } = req.body
  try {
    const response = await fetch(
      process.env.REACT_APP_SUPABASE_URL + '/functions/v1/woo-shipped',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY
        },
        body: JSON.stringify({ wooOrderId, trackingNumber })
      }
    )
    const data = await response.json()
    res.status(response.ok ? 200 : 400).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
