import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID")!
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_KEY = Deno.env.get("EBAY_SUPABASE_SERVICE_KEY")!

async function getEbayToken() {
  const credentials = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`)
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  })
  const data = await res.json()
  return data.access_token
}

async function fetchEbayOrders(token: string) {
  const res = await fetch("https://api.ebay.com/sell/fulfillment/v1/order?limit=50&orderFulfillmentStatus=NOT_STARTED", {
    headers: { "Authorization": `Bearer ${token}` },
  })
  const data = await res.json()
  return data.orders || []
}

serve(async () => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const token = await getEbayToken()
    const ebayOrders = await fetchEbayOrders(token)

    let imported = 0
    for (const order of ebayOrders) {
      const buyer = order.buyer || {}
      const item = order.lineItems?.[0] || {}
      const shipping = order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo || {}
      const ref = `EBAY-${order.orderId.slice(-8)}`

      const { data: existing } = await supabase
        .from("orders").select("id").eq("order_ref", ref).single()
      if (existing) continue

      await supabase.from("orders").insert({
        order_ref: ref,
        customer_name: `${shipping.fullName || buyer.username || "eBay Customer"}`,
        email: buyer.buyerRegistrationAddress?.email || "",
        phone: shipping.primaryPhone?.phoneNumber || "",
        car: item.title || "See eBay order",
        seats: "Full set (5)",
        color: "",
        source: "eBay",
        stage: "New",
        notes: `eBay Order ID: ${order.orderId}`,
        order_date: order.creationDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        photos: [],
      })
      imported++
    }

    return new Response(JSON.stringify({ success: true, imported }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})