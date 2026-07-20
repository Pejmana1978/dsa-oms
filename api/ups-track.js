import { requireUser } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!(await requireUser(req, res))) return
  const { trackingNumber } = req.body
  try {
    const tokenRes = await fetch('https://onlinetools.ups.com/security/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${process.env.UPS_CLIENT_ID}:${process.env.UPS_CLIENT_SECRET}`).toString('base64')
      },
      body: 'grant_type=client_credentials'
    })
    const tokenData = await tokenRes.json()
    const token = tokenData.access_token

    const trackRes = await fetch(`https://onlinetools.ups.com/api/track/v1/details/${trackingNumber}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'transId': trackingNumber,
        'transactionSrc': 'seatcover-oms'
      }
    })
    const trackData = await trackRes.json()
    const activity = trackData.trackResponse?.shipment?.[0]?.package?.[0]?.activity?.[0]
    const status = activity?.status?.description || 'Unknown'
    const delivered = status.toLowerCase().includes('delivered')
    return res.status(200).json({ status, delivered })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
