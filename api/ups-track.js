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
    // Surface real UPS errors — the button used to swallow them as a bare
    // "Error" chip, hiding e.g. 250002 (Tracking product not enabled on the app).
    const upsErr = trackData.response?.errors?.[0]
    if (upsErr) {
      const hint = upsErr.code === '250002'
        ? ' — the UPS app is missing the "Tracking" API product (add it at developer.ups.com → Apps)'
        : ''
      return res.status(400).json({ error: `UPS ${upsErr.code}: ${upsErr.message}${hint}` })
    }
    const pkg = trackData.trackResponse?.shipment?.[0]?.package?.[0]
    const activity = pkg?.activity?.[0]
    const status = pkg?.currentStatus?.description || activity?.status?.description || 'Unknown'
    const delivered = activity?.status?.type === 'D'
      || /delivered/i.test(status)
      || (pkg?.deliveryDate || []).some(d => d?.type === 'DEL')
    return res.status(200).json({ status, delivered })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
