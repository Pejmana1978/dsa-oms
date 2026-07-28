import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const WOO_URL = (Deno.env.get("WOO_URL") || "https://www.dsaseatfactory.com").replace(/\/$/, "")
const WOO_KEY = Deno.env.get("WOO_CONSUMER_KEY") || ""
const WOO_SECRET = Deno.env.get("WOO_CONSUMER_SECRET") || ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EBAY_SUPABASE_SERVICE_KEY")!

// Import website orders created on/after this date — no historical backfill.
const IMPORT_SINCE = "2026-07-22T00:00:00"
// US/Canada web orders are fulfilled by the US team (Juan) in ShipStation, not
// through this OMS. They are still IMPORTED — flagged as us_team — purely so
// nothing can be forgotten: they show on the US/Canada watchlist, never in the
// production/shipping queues.
const US_TEAM_COUNTRIES = ["US", "CA"]

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

// Cloudberry's firewall blocks /wp-json/wc/v3/ except for requests carrying
// this shared secret header (agreed with Kamal, 2026-07-23) — it is what gets
// the OMS through, in addition to the WooCommerce key/secret.
const OMS_AUTH = Deno.env.get("WOO_OMS_AUTH_TOKEN") || ""

function wooHeaders() {
  const h: Record<string, string> = {
    "Authorization": `Basic ${btoa(`${WOO_KEY}:${WOO_SECRET}`)}`,
  }
  if (OMS_AUTH) h["X-OMS-Auth"] = OMS_AUTH
  return h
}

// Juan types the tracking number into WooCommerce (never into the OMS), so
// pull it back out. Different tracking plugins store it under different meta
// keys, so scan for anything tracking-shaped rather than hardcoding one.
function extractTracking(o: any): string {
  for (const m of (o.meta_data || [])) {
    const key = String(m?.key || "").toLowerCase()
    if (!key.includes("tracking")) continue
    const v = m.value
    if (typeof v === "string" && v.trim()) return v.trim()
    if (Array.isArray(v) && v.length) {
      const t = v[0]?.tracking_number ?? v[0]?.trackingNumber
      if (t) return String(t).trim()
    }
    if (v && typeof v === "object") {
      const t = (v as any).tracking_number ?? (v as any).trackingNumber
      if (t) return String(t).trim()
    }
  }
  return ""
}

// The shop records each item's real options as product attributes (Colour /
// Position / Seat Side) — far more reliable than parsing them out of the
// product title, which is all the eBay side can do.
function specFromLineItem(li: any) {
  const attrs: Record<string, string> = {}
  for (const m of (li.meta_data || [])) {
    const k = String(m?.display_key || m?.key || "").trim().toLowerCase()
    const v = String(m?.display_value ?? m?.value ?? "").trim()
    if (k && v && !k.startsWith("_")) attrs[k] = v
  }
  const split = (s: string) => s.split(/[,&+/]|\band\b/i).map(x => x.trim()).filter(Boolean)
  const color = attrs["colour"] || attrs["color"] || ""
  const seats = attrs["position"] ? split(attrs["position"]) : []      // Bottom / Top
  const sides = attrs["seat side"] ? split(attrs["seat side"]) : []    // Driver / Passenger
  const position: string[] = []
  for (const side of (sides.length ? sides : [""])) {
    for (const seat of (seats.length ? seats : [""])) {
      const label = [side, seat].filter(Boolean).join(" ")
      if (label) position.push(label)
    }
  }
  return { color, position }
}

// After checkout the customer is sent to a form for their VIN ("Seat Code")
// and photos of the seats. Cloudberry writes each submission onto the order as
// `seatfactory_submissions` — [{entry_id, submitted_at, seat_code, images[]}].
// Submissions arrive AFTER the order is placed (and can be repeated), so this
// is read on every sync, not just at import.
function extractSubmissions(o: any) {
  const meta = (o.meta_data || []).find((m: any) => m?.key === "seatfactory_submissions")
  const subs: any[] = Array.isArray(meta?.value) ? meta.value : []
  if (subs.length === 0) return { vin: "", photos: [] as any[], extraVins: [] as string[] }

  // Newest submission wins — a resubmission is the customer correcting himself.
  const sorted = [...subs].sort((a, b) =>
    String(b?.submitted_at || "").localeCompare(String(a?.submitted_at || "")))
  const codes = sorted.map(s => String(s?.seat_code || "").trim()).filter(Boolean)
  const vin = codes[0] || ""
  // If the customer sent genuinely different codes, the operator must decide.
  const extraVins = [...new Set(codes.slice(1))].filter(c => c !== vin)

  const seen = new Set<string>()
  const photos: any[] = []
  for (const sub of sorted) {
    for (const url of (Array.isArray(sub?.images) ? sub.images : [])) {
      const u = String(url || "").trim()
      if (!u || seen.has(u)) continue
      seen.add(u)
      const raw = decodeURIComponent(u.split("?")[0].split("/").pop() || "photo.jpg")
      // The OMS decides "is this an image?" from the file extension in `name`.
      const name = /\.(jpe?g|png|gif|webp)$/i.test(raw) ? raw : raw + ".jpg"
      photos.push({ url: u, name })
    }
  }
  return { vin, photos, extraVins }
}

async function wooFetch(path: string) {
  const res = await fetch(`${WOO_URL}/wp-json/wc/v3${path}`, {
    headers: wooHeaders(),
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
    let importedUsCa = 0
    let linked = 0        // pre-existing manual orders newly linked to Woo
    let submissionsApplied = 0  // VIN/photos arriving after the order
    for (const o of wooOrders) {
      // Destination country decides the team — SHIPPING address, never billing
      // (a US customer shipping to Germany is a DSA order, and vice versa).
      const ship = o.shipping?.address_1 ? o.shipping : (o.billing || {})
      const country = String(ship.country || o.billing?.country || "").toUpperCase()
      const isUsTeam = US_TEAM_COUNTRIES.includes(country)
      const ref = String(o.number)
      const { data: existing } = await supabase
        .from("orders").select("id, woo_order_id, fulfillment_team, vin, photos").eq("order_ref", ref).single()
      if (existing) {
        // Orders entered by hand before the sync existed have no woo_order_id,
        // so the shipped-status write-back to WooCommerce would silently do
        // nothing. Backfill the link (and the US/CA flag) instead of skipping.
        const patch: Record<string, unknown> = {}
        if (!existing.woo_order_id) patch.woo_order_id = o.id
        // VIN / photos usually land after the order was already imported.
        const sub = extractSubmissions(o)
        if (sub.vin && !existing.vin) patch.vin = sub.vin
        if (sub.photos.length && !(existing.photos || []).length) patch.photos = sub.photos
        if (isUsTeam && !existing.fulfillment_team) {
          patch.fulfillment_team = "us_team"
          patch.us_status = "received"
        }
        if (Object.keys(patch).length > 0) {
          await supabase.from("orders").update(patch).eq("id", existing.id)
          linked++
          if (patch.vin || patch.photos) submissionsApplied++
        }
        continue
      }

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
        const attr = specFromLineItem(li)   // structured attributes win
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
          position: attr.position.length ? attr.position : spec.position,
          position_other: "",
          material: spec.material,
          color: attr.color || spec.color,
          item_notes: "",
        })
      }
      const sub = extractSubmissions(o)
      if (sub.vin) for (const it of itemsDetail) if (!it.vin) it.vin = sub.vin
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
        fulfillment_team: isUsTeam ? "us_team" : null,
        us_status: isUsTeam ? "received" : null,
        vin: sub.vin || null,
        photos: sub.photos,
        notes: [o.customer_note || "",
                sub.extraVins.length ? `\u26a0 Customer also submitted a different Seat Code: ${sub.extraVins.join(", ")}` : ""]
               .filter(Boolean).join("\n"),
        thumbnail: first.thumbnail || "",
        sale_amount: o.total ? parseFloat(o.total) : null,
        sale_currency: o.currency || null,
        shipping_cost: o.shipping_total ? parseFloat(o.shipping_total) : null,
        order_date: (o.date_created || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
        items: itemsDetail,
      })
      if (!error) { imported++; if (isUsTeam) importedUsCa++ }
    }

    // Reconcile: active Website orders that changed state in Woo.
    const { data: activeWeb } = await supabase
      .from("orders")
      .select("id, order_ref, refund_amount, sale_amount, fulfillment_team, us_status, woo_completed_at, tracking_number")
      .eq("source", "Website")
      .eq("archived", false)

    // Completed in WooCommerce = the order really shipped. The US team (Juan)
    // often marks it Completed in the Woo backend instead of entering tracking
    // in the OMS, so treat that as proof of shipment and close the watchlist
    // entry — otherwise the 5-day warning would fire on an order already gone.
    let usAutoShipped = 0
    const completedWoo = await wooFetchAll("status=completed", 5)
    for (const o of completedWoo) {
      const existing = activeWeb?.find((x: any) => x.order_ref === String(o.number))
      if (!existing) continue
      const patch: Record<string, unknown> = {}
      // Woo already says completed — never write the status back to it again.
      if (!existing.woo_completed_at) patch.woo_completed_at = new Date().toISOString()
      if (existing.fulfillment_team === "us_team" && existing.us_status !== "shipped") {
        patch.us_status = "shipped"
        patch.us_shipped_at = new Date().toISOString()
      }
      // Bring Juan's tracking number across so it's visible in the OMS too.
      const tracking = extractTracking(o)
      if (tracking && !existing.tracking_number) patch.tracking_number = tracking
      if (Object.keys(patch).length > 0) {
        await supabase.from("orders").update(patch).eq("id", existing.id)
        if (patch.us_status) usAutoShipped++
      }
    }

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

    return new Response(JSON.stringify({ success: true, imported, importedUsCa, linked, submissionsApplied, usAutoShipped, cancelled, refunded, total: wooOrders.length }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})
