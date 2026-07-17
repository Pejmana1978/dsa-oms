import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID")!
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_KEY = Deno.env.get("EBAY_SUPABASE_SERVICE_KEY")!

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

async function getAppToken(): Promise<string> {
  const credentials = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`)
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
  })
  const data = await res.json()
  return data.access_token || ""
}

async function getThumbnail(itemId: string, sku: string): Promise<string> {
  const appToken = await getAppToken()
  if (!appToken) return ""
  const variationId = sku ? sku.split("_")[1] || "0" : "0"
  const urls = [
    `https://api.ebay.com/buy/browse/v1/item/v1|${itemId}|${variationId}?fieldgroups=PRODUCT`,
    `https://api.ebay.com/buy/browse/v1/item/v1|${itemId}|0?fieldgroups=PRODUCT`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${appToken}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB",
        },
      })
      const data = await res.json()
      const img = data.image?.imageUrl || data.additionalImages?.[0]?.imageUrl || ""
      if (img) return img
    } catch {
      continue
    }
  }
  return ""
}

const COUNTRY_CODES: Record<string, string> = {
  GB: "44", DE: "49", FR: "33", IT: "39", ES: "34", NL: "31",
  BE: "32", AT: "43", SE: "46", NO: "47", DK: "45", FI: "358",
  PL: "48", PT: "351", IE: "353", CH: "41", US: "1", CA: "1",
  AU: "61", NZ: "64", JP: "81", KR: "82", SG: "65", AE: "971",
}

function formatPhone(phone: string, countryCode = "") {
  if (!phone) return ""
  const cleaned = phone.replace(/[\s\-().+]/g, "")
  if (cleaned.length < 7) return ""
  if (!cleaned.startsWith("0")) {
    if (cleaned.startsWith("00")) return "+" + cleaned.slice(2)
    return "+" + cleaned
  }
  const cc = COUNTRY_CODES[countryCode] || ""
  if (cc) return "+" + cc + cleaned.slice(1)
  return "+" + cleaned
}

serve(async () => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const token = await getEbayToken()
    const res = await fetch("https://api.ebay.com/sell/fulfillment/v1/order?limit=50", {
      headers: { "Authorization": `Bearer ${token}` },
    })
    const ebayData = await res.json()
    const ebayOrders = ebayData.orders || []
    let imported = 0
    for (const order of ebayOrders) {
      const ref = order.orderId
      const { data: existing } = await supabase.from("orders").select("id").eq("order_ref", ref).single()
      if (existing) continue
      const buyer = order.buyer || {}
      const items = order.lineItems || []
      const item = items[0] || {}
      const fulfillment = order.fulfillmentStartInstructions?.[0] || {}
      const shipTo = fulfillment.shippingStep?.shipTo || {}
      const contactAddr = shipTo.contactAddress || {}
      const phone1 = shipTo.primaryPhone?.phoneNumber?.trim() || ""
      const phone2 = shipTo.backupPhone?.phoneNumber?.trim() || ""
      const phone = [phone1, phone2].filter(Boolean).join(" / ")
      const address = [
        contactAddr.addressLine1,
        contactAddr.addressLine2,
        contactAddr.city,
        contactAddr.stateOrProvince,
        contactAddr.postalCode,
        contactAddr.countryCode,
      ].filter(Boolean).join(", ")
      const legacyItemId = item.legacyItemId || ""
      const sku = item.sku || legacyItemId || ""
      const thumbnail = legacyItemId ? await getThumbnail(legacyItemId, sku) : ""
      const buyerUsername = buyer.username || ""
      // Multi-item orders: one OMS row per eBay order, so aggregate ALL line
      // items (previously only lineItems[0] was imported — items got dropped).
      // Full per-item detail (incl. per-item thumbnails) goes into `items`.
      const itemsDetail: any[] = []
      for (let i = 0; i < items.length; i++) {
        const li = items[i]
        const liId = li.legacyItemId || ""
        const liSku = li.sku || liId || ""
        const liThumb = i === 0 ? thumbnail : (liId ? await getThumbnail(liId, liSku) : "")
        itemsDetail.push({
          title: li.title || "",
          quantity: Number(li.quantity) || 1,
          price: li.lineItemCost?.value ? parseFloat(li.lineItemCost.value) : null,
          currency: li.lineItemCost?.currency || null,
          item_id: liId,
          sku: li.sku || "",
          thumbnail: liThumb,
        })
      }
      const totalQuantity = items.reduce((n: number, li: any) => n + (Number(li.quantity) || 0), 0) || 1
      const itemsCostSum = items.reduce((s: number, li: any) => s + (parseFloat(li.lineItemCost?.value || "0") || 0), 0)
      const orderTotal = order.pricingSummary?.total?.value
        ? parseFloat(order.pricingSummary.total.value)
        : (itemsCostSum || null)
      const orderCurrency = order.pricingSummary?.total?.currency || item.lineItemCost?.currency || null
      const car = items.length > 1
        ? `${item.title || "See eBay order"} [+${items.length - 1} more — see notes]`
        : (item.title || "See eBay order")
      const notes = items.length > 1
        ? `MULTI-ITEM ORDER — ${items.length} items:\n` + items.map((li: any, i: number) =>
            `${i + 1}. ${li.title || "?"} — qty ${li.quantity || 1} @ ${li.lineItemCost?.value || "?"} ${li.lineItemCost?.currency || ""} (item ${li.legacyItemId || "?"}${li.sku ? `, SKU ${li.sku}` : ""})`
          ).join("\n")
        : ""
      const { error } = await supabase.from("orders").insert({
        order_ref: ref,
        customer_name: shipTo.fullName || buyerUsername || "eBay Customer",
        email: buyer.email || shipTo.email || "",
        phone: phone,
        address: address,
        car: car,
        seats: "Full set (5)",
        quantity: totalQuantity,
        color: "",
        source: "eBay",
        stage: "New",
        notes: notes,
        thumbnail: thumbnail,
        ebay_item_id: legacyItemId,
        sale_amount: orderTotal,
        sale_currency: orderCurrency,
        order_date: order.creationDate ? order.creationDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
        photos: [],
        items: itemsDetail,
      })
      if (!error) imported++
    }
    // Check existing eBay orders for cancellations and refunds
    const { data: existingOrders } = await supabase
      .from("orders")
      .select("id, order_ref, archived, refund_amount")
      .eq("source", "eBay")
      .eq("archived", false)

    let cancelled = 0
    let refunded = 0

    for (const ebayOrder of ebayOrders) {
      const ref = ebayOrder.orderId
      const existing = existingOrders?.find(o => o.order_ref === ref)
      if (!existing) continue

      // Check for cancellation - archive if cancelled regardless of refund state
      const isCancelled = ebayOrder.cancelStatus?.cancelState === 'CANCEL_COMPLETE' ||
        ebayOrder.orderFulfillmentStatus === 'NOT_STARTED' && (ebayOrder.cancelStatus?.cancelRequests?.length > 0)
      if (isCancelled) {
        await supabase.from("orders").update({ archived: true, refund_note: 'Cancelled on eBay', refund_amount: ebayOrder.pricingSummary?.total?.value ? parseFloat(ebayOrder.pricingSummary.total.value) : 0 }).eq("id", existing.id)
        cancelled++
        continue
      }

      // Check for refunds
      const refundAmount = ebayOrder.paymentSummary?.refunds?.reduce((sum: number, r: any) => sum + parseFloat(r.amount?.value || 0), 0) || 0
      if (refundAmount > 0 && refundAmount !== existing.refund_amount) {
        const refundDate = ebayOrder.paymentSummary?.refunds?.[0]?.refundDate?.slice(0, 10) || new Date().toISOString().slice(0, 10)
        const saleAmount = existing.sale_amount || 0
        const isFullRefund = saleAmount > 0 && refundAmount >= saleAmount
        await supabase.from("orders").update({
          refund_amount: refundAmount,
          refund_date: refundDate,
          refund_note: ebayOrder.paymentSummary?.refunds?.[0]?.refundType || 'Refund',
          archived: isFullRefund ? true : false
        }).eq("id", existing.id)
        refunded++
      }
    }

    return new Response(JSON.stringify({ success: true, imported, cancelled, refunded, total: ebayOrders.length }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})
