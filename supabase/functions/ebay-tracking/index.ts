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

serve(async (req) => {
  try {
    const { orderId, trackingNumber } = await req.json()
    const token = await getToken()

    // First fetch the order to get the lineItemId
    const orderRes = await fetch(`https://api.ebay.com/sell/fulfillment/v1/order/${orderId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    })
    const orderData = await orderRes.json()
    const lineItemId = orderData.lineItems?.[0]?.lineItemId

    if (!lineItemId) {
      return new Response(JSON.stringify({ error: "Could not find lineItemId for order" }), { status: 400 })
    }

    const res = await fetch(`https://api.ebay.com/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        lineItems: [{ lineItemId: lineItemId }],
        shippingCarrierCode: "UPS",
        trackingNumber: trackingNumber,
        shippedDate: new Date().toISOString(),
      }),
    })
    const data = await res.json()
    if (!res.ok) return new Response(JSON.stringify({ error: data }), { status: 400 })
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})
