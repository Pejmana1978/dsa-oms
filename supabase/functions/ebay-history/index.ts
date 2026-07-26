import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// One-off ANALYSIS function: pulls up to 2 years of eBay orders and returns
// aggregates only (country / month / model buckets). Nothing is written.

const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID")!
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET")!

async function getEbayToken() {
  const credentials = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`)
  const refreshToken = Deno.env.get("EBAY_REFRESH_TOKEN")!
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&scope=https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly`,
  })
  const data = await res.json()
  return data.access_token
}

function modelBucket(t: string): string {
  const s = (t || "").toLowerCase()
  if (/glc/.test(s)) return "Mercedes GLC"
  if (/gl[es]\b|\bgl\b|gl[- ]class/.test(s)) return "Mercedes GL/GLE/GLS"
  if (/\bml\b|m[- ]class/.test(s)) return "Mercedes ML"
  if (/c[- ]?class|c[- ]?klasse|w20[2-5]/.test(s)) return "Mercedes C-Class"
  if (/e[- ]?class|e[- ]?klasse|w21[0-4]/.test(s)) return "Mercedes E-Class"
  if (/s[- ]?class|s[- ]?klasse|w22[0-3]/.test(s)) return "Mercedes S-Class"
  if (/slk|\bsl\b|r17[01]|r230/.test(s)) return "Mercedes SL/SLK"
  if (/mercedes|\bmb\b/.test(s)) return "Mercedes other"
  if (/grand cherokee/.test(s)) return "Jeep Grand Cherokee"
  if (/wrangler/.test(s)) return "Jeep Wrangler"
  if (/jeep/.test(s)) return "Jeep other"
  if (/discovery/.test(s)) return "Land Rover Discovery"
  if (/range rover|land rover/.test(s)) return "Land Rover other"
  if (/mustang/.test(s)) return "Ford Mustang"
  if (/jaguar|xk8|xkr/.test(s)) return "Jaguar"
  if (/porsche|911|boxster|cayenne/.test(s)) return "Porsche"
  if (/bmw|\be[0-9]{2}\b/.test(s)) return "BMW"
  if (/audi/.test(s)) return "Audi"
  if (/volvo/.test(s)) return "Volvo"
  if (/corvette|camaro|chevrolet/.test(s)) return "Chevrolet"
  if (/dodge|ram\b/.test(s)) return "Dodge/RAM"
  return "Other"
}

serve(async () => {
  try {
    const token = await getEbayToken()
    const now = new Date()
    const start = new Date(now.getTime() - 730 * 24 * 3600 * 1000) // 2 years

    const byCountry: Record<string, any> = {}
    const byMonth: Record<string, any> = {}
    const byModel: Record<string, any> = {}
    let total = 0
    let cancelled = 0

    // Walk in 90-day windows to keep offsets small.
    for (let ws = start.getTime(); ws < now.getTime(); ws += 90 * 24 * 3600 * 1000) {
      const we = Math.min(ws + 90 * 24 * 3600 * 1000, now.getTime())
      const range = `creationdate:%5B${new Date(ws).toISOString().replace(/\.\d+Z/, ".000Z")}..${new Date(we).toISOString().replace(/\.\d+Z/, ".000Z")}%5D`
      for (let offset = 0; offset < 1000; offset += 100) {
        const res = await fetch(`https://api.ebay.com/sell/fulfillment/v1/order?limit=100&offset=${offset}&filter=${range}`, {
          headers: { "Authorization": `Bearer ${token}` },
        })
        const data = await res.json()
        const orders = data.orders || []
        for (const o of orders) {
          if (o.cancelStatus?.cancelState === "CANCEL_COMPLETE") { cancelled++; continue }
          total++
          const country = o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress?.countryCode || "??"
          const cur = o.pricingSummary?.total?.currency || "?"
          const val = parseFloat(o.pricingSummary?.total?.value || "0") || 0
          const month = (o.creationDate || "").slice(0, 7)

          byCountry[country] ??= { orders: 0, revenue: {} }
          byCountry[country].orders++
          byCountry[country].revenue[cur] = (byCountry[country].revenue[cur] || 0) + val

          byMonth[month] ??= { orders: 0 }
          byMonth[month].orders++

          for (const li of (o.lineItems || [])) {
            const b = modelBucket(li.title || "")
            byModel[b] ??= { items: 0, dach: 0, uk: 0 }
            byModel[b].items += Number(li.quantity) || 1
            if (["DE", "AT", "CH"].includes(country)) byModel[b].dach++
            if (country === "GB") byModel[b].uk++
          }
        }
        if (orders.length < 100) break
      }
    }

    // Round revenue for readability.
    for (const c of Object.keys(byCountry)) {
      for (const cur of Object.keys(byCountry[c].revenue)) {
        byCountry[c].revenue[cur] = Math.round(byCountry[c].revenue[cur])
      }
    }

    return new Response(JSON.stringify({ success: true, totalOrders: total, cancelled, byCountry, byMonth, byModel }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})
