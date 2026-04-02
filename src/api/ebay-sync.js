export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const response = await fetch(
      process.env.REACT_APP_SUPABASE_URL + '/functions/v1/ebay-sync',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.REACT_APP_SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + process.env.REACT_APP_SUPABASE_ANON_KEY
        },
        body: '{}'
      }
    )
    const data = await response.json()
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
