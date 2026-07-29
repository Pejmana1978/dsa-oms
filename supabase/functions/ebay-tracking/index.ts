import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID")!
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET")!
const EBAY_REFRESH_TOKEN = Deno.env.get("EBAY_REFRESH_TOKEN")!

async function getToken() {
  const credentials = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`)
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(EBAY_REFRESH_TOKEN)}&scope=https://api.ebay.com/oauth/api_scope/sell.fulfillment`,
  })
  const data = await res.json()
  return data.access_token
}

// Reports the tracking number to eBay for EVERY line item of an order — a
// buyer who ordered two covers must see tracking on both, or the second item
// sits "awaiting shipment" forever.
//
// Line items already covered by an existing fulfillment are skipped: eBay
// rejects a fulfillment that repeats one, so without this a partially-tracked
// order (e.g. tracked before this function handled multi-item orders) could
// never be repaired, and a re-run would fail instead of doing nothing.
serve(async (req) => {
  try {
    const { orderId, trackingNumber, inspect } = await req.json()
    if (!orderId) {
      return new Response(JSON.stringify({ error: "orderId is required" }), { status: 400 })
    }
    const token = await getToken()
    const auth = { "Authorization": `Bearer ${token}` }

    const orderRes = await fetch(`https://api.ebay.com/sell/fulfillment/v1/order/${orderId}`, { headers: auth })
    const orderData = await orderRes.json()
    const allItems = (orderData.lineItems || [])
      .map((li: any) => ({ lineItemId: li.lineItemId, quantity: Number(li.quantity) || 1, title: li.title }))
      .filter((li: any) => li.lineItemId)

    if (allItems.length === 0) {
      return new Response(JSON.stringify({ error: "Could not find any lineItemId", orderKeys: Object.keys(orderData) }), { status: 400 })
    }

    // What does eBay already have tracking for?
    const fulRes = await fetch(`https://api.ebay.com/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`, { headers: auth })
    const fulData = await fulRes.json()
    const fulfilled = new Set<string>()
    for (const f of (fulData.fulfillments || [])) {
      for (const li of (f.lineItems || [])) if (li.lineItemId) fulfilled.add(String(li.lineItemId))
    }

    const pending = allItems.filter((li: any) => !fulfilled.has(String(li.lineItemId)))

    if (inspect) {
      return new Response(JSON.stringify({
        orderId,
        lineItems: allItems.length,
        alreadyTracked: fulfilled.size,
        pending: pending.length,
        existingFulfillments: (fulData.fulfillments || []).map((f: any) => ({
          trackingNumber: f.shipmentTrackingNumber,
          lineItems: (f.lineItems || []).length,
        })),
      }, null, 1), { headers: { "Content-Type": "application/json" } })
    }

    if (pending.length === 0) {
      return new Response(JSON.stringify({ success: true, skipped: "every line item already has tracking", lineItems: allItems.length }), {
        headers: { "Content-Type": "application/json" },
      })
    }
    if (!trackingNumber) {
      return new Response(JSON.stringify({ error: "trackingNumber is required" }), { status: 400 })
    }

    const res = await fetch(`https://api.ebay.com/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        lineItems: pending.map((li: any) => ({ lineItemId: li.lineItemId, quantity: li.quantity })),
        shippingCarrierCode: "UPS",
        trackingNumber: trackingNumber,
        shippedDate: new Date().toISOString(),
      }),
    })
    // eBay answers a successful fulfillment with 201 and an EMPTY body, so
    // res.json() throws and a real success looks like a failure. Read the text
    // and only parse when there is something to parse.
    const raw = await res.text()
    if (!res.ok) {
      let detail: unknown = raw
      try { detail = raw ? JSON.parse(raw) : raw } catch { /* keep the raw text */ }
      return new Response(JSON.stringify({ error: detail }), { status: 400 })
    }
    return new Response(JSON.stringify({
      success: true,
      fulfilled: pending.length,
      alreadyHad: fulfilled.size,
      lineItems: allItems.length,
    }), { headers: { "Content-Type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})
