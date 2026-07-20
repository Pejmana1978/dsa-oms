import { requireUser } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!(await requireUser(req, res))) return
  const { orderId, trackingNumber, lineItemId } = req.body
  try {
    const response = await fetch(
      process.env.REACT_APP_SUPABASE_URL + '/functions/v1/ebay-tracking',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ orderId, trackingNumber, lineItemId })
      }
    )
    const data = await response.json()
    if (!response.ok) return res.status(400).json({ error: data })
    return res.status(200).json({ success: true })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
