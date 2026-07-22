import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const WOO_URL = (Deno.env.get("WOO_URL") || "https://www.dsaseatfactory.com").replace(/\/$/, "")
const WOO_KEY = Deno.env.get("WOO_CONSUMER_KEY") || ""
const WOO_SECRET = Deno.env.get("WOO_CONSUMER_SECRET") || ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EBAY_SUPABASE_SERVICE_KEY")!

// Import website orders created on/after this date — no historical backfill.
const IMPORT_SINCE = "2026-07-22T00:00:00"
// DSA OMS is the EU brand: US/Canada web orders are handled outside it.
const SKIP_COUNTRIES = ["US", "CA"]

// Same title parser as ebay-sync — pre-fills car / position / material / color.
function parseSpec(title: string) {
  const t = title || ""
  const yearMatch = t.match(/\b((?:19|20)\d{2})(?:[\-–]((?:19|20)\d{2}))?\b/)
  const year = yearMatch ? yearMatch[0] : ""
  const mm = t.match(/(?:For\s+)?(?:(?:19|20)\d{2}[\-–](?:19|20)\d{2}\s+)?([A-Z][\w\-]+(?:\s+[A-Z][\w\-]+){1,3})/i)
  const makeModel = mm ? mm[1].trim() : ""
  const car = makeModel && year ? `${makeModel} ${year}` : makeModel || t
  const position: string[] = []
  if (/driver\s+bottom/i.test(t)) position.push("Driver Bottom")
  if (/driver\s+top/i.test(t)) position.push("Driver Top")
  if (/passenger\s+bottom/i.test(t)) position.push("Passenger Bottom")
  if (/passenger\s+top/i.test(t)) position.push("Passenger Top")
  let material = ""
  if (/leather\s+perf/i.test(t)) material = "Leather perf"
  else if (/leather/i.test(t)) material = "Leather"
  else if (/vinyl\s+perf/i.test(t)) material = "Vinyl perf"
  else if (/vinyl/i.test(t)) material = "Vinyl"
  else if (/alcantara/i.test(t)) material = "Vinyl & Alcantara"
  else if (/cloth/i.test(t)) material = "Cloth"
  let color = ""
  const cm = t.match(/\b(black|grey|gray|beige|brown|red|blue|navy|tan|white|cream|camel|cognac|bordeaux)\b/i)
  if (cm) color = cm[1].charAt(0).toUpperCase() + cm[1].slice(1).toLowerCase()
  return { car, position, material, color }
}

async function wooFetch(path: string) {
  const auth = btoa(`${WOO_KEY}:${WOO_SECRET}`)
  const res = await fetch(`${WOO_URL}/wp-json/wc/v3${path}`, {
    headers: { "Authorization": `Basic ${auth}` },
  })
  if (!res.ok) throw new Error(`WooCommerce ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return await res.json()
}

async function wooFetchAll(query: string, maxPages = 10) {
  const all: any[] = []
  for (let page = 1; page <= maxPages; page++) {
    const batch = await wooFetch(`/orders?${query}&per_page=50&page=${page}&after=${IMPORT_SINCE}`)
    all.push(...batch)
    if (batch.length < 50) break
  }
  return all
}

serve(async () => {
  try {
    if (!WOO_KEY || !WOO_SECRET) {
      return new Response(JSON.stringify({ error: "WooCommerce keys not configured yet (add WOO_CONSUMER_KEY / WOO_CONSUMER_SECRET in Supabase Edge Function secrets)" }), { status: 400 })
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // New paid orders awaiting fulfillment.
    const wooOrders = await wooFetchAll("status=processing")
    let imported = 0
    let skippedUsCa = 0
    for (const o of wooOrders) {
      const ship = o.shipping?.address_1 ? o.shipping : (o.billing || {})
      const country = String(ship.country || o.billing?.country || "").toUpperCase()
      if (SKIP_COUNTRIES.includes(country)) { skippedUsCa++; continue }
      const ref = String(o.number)
      const { data: existing } = await supabase.from("orders").select("id").eq("order_ref", ref).single()
      if (existing) continue

      const itemsDetail: any[] = []
      for (const li of (o.line_items || [])) {
        let thumb = li.image?.src || ""
        if (!thumb && li.product_id) {
          try {
            const p = await wooFetch(`/products/${li.product_id}`)
            thumb = p.images?.[0]?.src || ""
          } catch { /* thumbnail is nice-to-have */ }
        }
        const spec = parseSpec(li.name || "")
        itemsDetail.push({
          title: li.name || "",
          quantity: Number(li.quantity) || 1,
          price: li.total ? parseFloat(li.total) : null,
          currency: o.currency || null,
          item_id: String(li.product_id || ""),
          sku: li.sku || "",
          thumbnail: thumb,
          custom_thumbnail: "",
          car: spec.car,
          vin: "",
          year: "",
          position: spec.position,
          position_other: "",
          material: spec.material,
          color: spec.color,
          item_notes: "",
        })
      }
      const totalQuantity = itemsDetail.reduce((n, it) => n + (it.quantity || 1), 0) || 1
      const first = itemsDetail[0] || {}
      const address = [ship.address_1, ship.address_2, ship.city, ship.state, ship.postcode, country]
        .filter(Boolean).map(String).map(s => s.trim()).filter(Boolean).join(", ")

      const { error } = await supabase.from("orders").insert({
        order_ref: ref,
        woo_order_id: o.id,
        customer_name: [ship.first_name, ship.last_name].filter(Boolean).join(" ")
          || [o.billing?.first_name, o.billing?.last_name].filter(Boolean).join(" ")
          || "Website Customer",
        email: o.billing?.email || "",
        phone: o.billing?.phone || "",
        address,
        car: itemsDetail.length > 1
          ? `${first.title || "See order"} [+${itemsDetail.length - 1} more]`
          : (first.title || "See order"),
        seats: "",
        quantity: totalQuantity,
        color: "",
        source: "Website",
        stage: "New",
        notes: o.customer_note || "",
        thumbnail: first.thumbnail || "",
        sale_amount: o.total ? parseFloat(o.total) : null,
        sale_currency: o.currency || null,
        shipping_cost: o.shipping_total ? parseFloat(o.shipping_total) : null,
        order_date: (o.date_created || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
        photos: [],
        items: itemsDetail,
      })
      if (!error) imported++
    }

    // Reconcile: active Website orders that were cancelled/refunded in Woo.
    const { data: activeWeb } = await supabase
      .from("orders")
      .select("id, order_ref, refund_amount, sale_amount")
      .eq("source", "Website")
      .eq("archived", false)

    let cancelled = 0
    let refunded = 0
    for (const status of ["cancelled", "refunded"]) {
      const closed = await wooFetchAll(`status=${status}`, 5)
      for (const o of closed) {
        const existing = activeWeb?.find((x: any) => x.order_ref === String(o.number))
        if (!existing) continue
        const refundSum = Math.abs((o.refunds || []).reduce((s: number, r: any) => s + parseFloat(r.total || "0"), 0))
        await supabase.from("orders").update({
          archived: true,
          refund_note: status === "cancelled" ? "Cancelled on website" : "Refunded on website",
          refund_amount: refundSum || (o.total ? parseFloat(o.total) : 0),
          refund_date: new Date().toISOString().slice(0, 10),
        }).eq("id", existing.id)
        if (status === "cancelled") cancelled++
        else refunded++
      }
    }

    return new Response(JSON.stringify({ success: true, imported, skippedUsCa, cancelled, refunded, total: wooOrders.length }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})
