import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const WOO_URL = (Deno.env.get("WOO_URL") || "https://www.dsaseatfactory.com").replace(/\/$/, "")
const WOO_KEY = Deno.env.get("WOO_CONSUMER_KEY") || ""
const WOO_SECRET = Deno.env.get("WOO_CONSUMER_SECRET") || ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EBAY_SUPABASE_SERVICE_KEY")!

// Marks a WooCommerce order Completed and leaves a customer-visible note with
// the tracking number. Triggered when the parcel is genuinely on its way:
//   EU orders    — the moment the UPS label is created
//   US/CA orders — the moment Juan's tracking number is entered
// Idempotent: orders.woo_completed_at is set once, so a repeated call never
// changes the status again or posts a duplicate note.
serve(async (req) => {
  try {
    if (!WOO_KEY || !WOO_SECRET) {
      return new Response(JSON.stringify({ error: "WooCommerce keys not configured" }), { status: 400 })
    }
    const { wooOrderId, trackingNumber, orderId } = await req.json()
    if (!wooOrderId) {
      return new Response(JSON.stringify({ error: "wooOrderId is required" }), { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // Already written back? Do nothing.
    if (orderId) {
      const { data: existing } = await supabase
        .from("orders").select("woo_completed_at").eq("id", orderId).single()
      if (existing?.woo_completed_at) {
        return new Response(JSON.stringify({ success: true, skipped: "already completed in WooCommerce" }), {
          headers: { "Content-Type": "application/json" },
        })
      }
    }

    // X-OMS-Auth is the shared secret Cloudberry's firewall allowlists for
    // /wp-json/wc/v3/ — without it the request never reaches WooCommerce.
    const omsAuth = Deno.env.get("WOO_OMS_AUTH_TOKEN") || ""
    const headers: Record<string, string> = {
      "Authorization": `Basic ${btoa(`${WOO_KEY}:${WOO_SECRET}`)}`,
      "Content-Type": "application/json",
    }
    if (omsAuth) headers["X-OMS-Auth"] = omsAuth

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
          note: `Your order has been shipped. Tracking number: ${trackingNumber} — follow it at https://www.ups.com/track?tracknum=${trackingNumber}`,
          customer_note: true,
        }),
      }).catch(() => {})
    }

    if (orderId) {
      await supabase.from("orders")
        .update({ woo_completed_at: new Date().toISOString() })
        .eq("id", orderId)
    }

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})
