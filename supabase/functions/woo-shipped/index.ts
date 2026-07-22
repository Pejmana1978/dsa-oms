import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const WOO_URL = (Deno.env.get("WOO_URL") || "https://www.dsaseatfactory.com").replace(/\/$/, "")
const WOO_KEY = Deno.env.get("WOO_CONSUMER_KEY") || ""
const WOO_SECRET = Deno.env.get("WOO_CONSUMER_SECRET") || ""

// Marks a WooCommerce order Completed when the OMS ships it to the customer,
// and leaves a customer-visible note with the UPS tracking number.
serve(async (req) => {
  try {
    if (!WOO_KEY || !WOO_SECRET) {
      return new Response(JSON.stringify({ error: "WooCommerce keys not configured" }), { status: 400 })
    }
    const { wooOrderId, trackingNumber } = await req.json()
    if (!wooOrderId) {
      return new Response(JSON.stringify({ error: "wooOrderId is required" }), { status: 400 })
    }
    const auth = btoa(`${WOO_KEY}:${WOO_SECRET}`)
    const headers = { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" }

    const res = await fetch(`${WOO_URL}/wp-json/wc/v3/orders/${wooOrderId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ status: "completed" }),
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `WooCommerce ${res.status}: ${(await res.text()).slice(0, 200)}` }), { status: 400 })
    }

    if (trackingNumber) {
      // Customer-visible note — best-effort, the status change is what matters.
      await fetch(`${WOO_URL}/wp-json/wc/v3/orders/${wooOrderId}/notes`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          note: `Your order has been shipped via UPS. Tracking number: ${trackingNumber} — follow it at https://www.ups.com/track?tracknum=${trackingNumber}`,
          customer_note: true,
        }),
      }).catch(() => {})
    }

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})
