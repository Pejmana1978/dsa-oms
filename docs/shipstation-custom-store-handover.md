# Handover: DSA WooCommerce → ShipStation, US/CA orders only

**Project:** `dsa-oms` (Next.js + Supabase + Vercel, repo under `Pejmana1978`)
**Supabase project ref:** `nvqhgkqjlvymnwcsfbee`
**Date:** 2026-07-26
**Owner:** Pejman
**Status:** Approved for build — this is the spec, not a proposal.

---

## 1. Goal

The DSA WooCommerce site sells to the EU/UK **and** to the US and Canada. Only the **US and Canada destination orders** should reach ShipStation. Everything else must never enter the ShipStation order queue.

## 2. Decision (and what was rejected)

**Build a ShipStation Custom Store endpoint inside `dsa-oms`.** ShipStation polls our endpoint; we return only orders whose ship-to country is `US` or `CA`. ShipStation posts shipment/tracking back to the same endpoint and we write it to WooCommerce.

Do **not** re-litigate these — they were considered and rejected:

| Option | Why rejected |
|---|---|
| Stock Woo ↔ ShipStation extension | No destination filter exists. Every order imports; country is only a view filter or an automation-rule tag *after* import. |
| Import everything + automation rule to tag/hold non-US/CA | Works, but pollutes the ShipStation order set and therefore the `raw_orders` pipeline; filtering is cosmetic, not structural. |
| Filter at the Woo endpoint by remapping order statuses | Overloads WooCommerce order status with a geography meaning; breaks anything else keying off status. |

The Custom Store also generalises: today the rule is country, tomorrow it can be SKU, brand, or warehouse routing.

## 3. Scope

**In scope**
- New endpoint in `dsa-oms`: `GET`/`POST` at `/api/shipstation` (Vercel-hosted, Basic auth).
- Export of US/CA WooCommerce orders to ShipStation.
- Shipment notification write-back to WooCommerce (tracking number, carrier, status → Completed).
- Registering the new ShipStation store in `store_dimension` with the correct `tax_treatment` flag.
- Heartbeat/alerting so a dead endpoint is visible.

**Out of scope**
- The DSA eBay integration (`ebay-sync`) — untouched.
- USF/Houston ShipStation stores — untouched.
- EU/UK fulfilment routing — those orders simply never leave WooCommerce for ShipStation.

## 4. ShipStation Custom Store contract

ShipStation calls one endpoint and distinguishes intent by the `action` query parameter. Authentication is HTTP Basic — ShipStation sends the username/password entered in the store setup screen on every call.

### 4.1 Export (ShipStation pulls orders)

```
GET /api/shipstation?action=export&start_date=<start>&end_date=<end>&page=<n>
```

- Dates arrive as a ShipStation-formatted datetime string. **Treat them as the order's *last modified* window, not created date** — an order edited after import must re-export so ShipStation picks up the change.
- Respond with XML: an `<Orders>` root carrying a `pages` attribute, containing `<Order>` elements. `pages` must be the total page count for the window so ShipStation knows to keep paging.
- **The filter lives here:** only include orders where the ship-to country is `US` or `CA`. Filter on the *shipping* address country, not billing — a US customer shipping to a German address is an EU order for our purposes, and vice versa.
- An empty window must return a valid `<Orders pages="1">` document, not a 404 or an empty body.
- Keep the response fast. Page size should be bounded (100–250 orders/page is sane); do not attempt to return the whole window in one document.
- Escape all customer-supplied text as CDATA. Seat-cover orders routinely carry vehicle/trim notes with `&` and quotes in them.

### 4.2 Ship notify (ShipStation pushes shipments back)

```
POST /api/shipstation?action=shipnotify&order_number=<n>&carrier=<c>&service=<s>&tracking_number=<t>
```

- Look the order up in WooCommerce, write tracking number + carrier, transition to Completed, and return `200`. Non-2xx makes ShipStation retry and eventually surface an error to the user.
- Must be **idempotent** — a repeated shipnotify for the same order must not duplicate tracking or re-trigger customer email.
- Handle partial shipments: if ShipStation ships part of an order, record the tracking without prematurely completing the order.

### 4.3 Reference

ShipStation's Custom Store Development Guide has the authoritative XML schema and field list. Pull the current version rather than working from memory — field-level details have shifted between revisions.

## 5. Data source

Two viable reads for the export, in preference order:

1. **WooCommerce REST API**, queried per request with a `modified_after`/`modified_before` window. Simplest, always current, no sync lag. Risk is Woo API latency inside ShipStation's request timeout.
2. **Supabase `orders`/`order_items`**, if we already mirror Woo orders there. Faster and more controllable, but adds a sync-lag failure mode: an order that hasn't landed in Supabase yet is invisible to ShipStation and simply never ships.

Start with option 1. Move to option 2 only if the endpoint proves slow under real volume, and if we do, the mirror needs its own freshness alarm.

## 6. Implementation notes / conventions

- Follow the existing project conventions: hyphenated lowercase folders under `~/Dropbox/0 Pejman/Claude Projects/seat-cover/`, `CLAUDE.md` updated for session continuity.
- Credentials (Woo consumer key/secret, ShipStation Basic auth user/pass) go in Vercel environment variables. Nothing hardcoded, nothing committed.
- Build this end-to-end agentically. Pejman does not want a list of terminal commands to run — the deliverable is a working, deployed endpoint plus the ShipStation-side setup instructions he can click through in the ShipStation UI.
- Note the known open issue in this project: **CORS errors when calling Supabase Edge Functions from the browser.** This endpoint is called server-to-server by ShipStation, so CORS should not apply — but if any part of the admin UI in `dsa-oms` calls it, expect the same problem and handle it deliberately.

## 7. Downstream: the analytics pipeline

Connecting a new ShipStation store affects the existing sales pipeline:

- Add a row to `store_dimension` for the new DSA-Woo store with the correct `tax_treatment` flag. Determine it empirically: check whether the "Amt Paid" figure on imported orders includes tax, using the Record # format heuristic already documented for this pipeline (eBay-native format = tax included, sequential = tax excluded). Do not guess it.
- US and CA orders may carry US sales tax; DSA charges VAT only on EU/UK destinations, and those orders don't reach ShipStation at all — so this store should be a clean, single-tax-regime source. Verify rather than assume.
- Confirm the `net_revenue` view produces sane numbers for the new store before anyone reports off it.

## 8. Failure modes to design for

| Failure | Consequence | Mitigation |
|---|---|---|
| Endpoint 500s or times out | Orders silently stop importing; nobody notices until a customer complains | Heartbeat check + alert if zero orders imported in N hours during business hours |
| Woo API slow, response exceeds ShipStation timeout | Partial or failed imports | Bound page size; cache/mirror if needed |
| Country filter reads billing instead of shipping address | EU orders leak into the Houston queue, or US orders vanish | Explicit test cases for mismatched billing/shipping countries |
| Duplicate shipnotify | Double tracking, duplicate customer email | Idempotency on order + tracking number |
| Order edited after import (address change, item swap) | ShipStation ships stale data | Export on *modified* date, not created date |

## 9. Acceptance criteria

1. ShipStation's "Test Connection" on the Custom Store succeeds.
2. A manual store refresh in ShipStation imports **only** US and CA orders from a window containing a mix of US, CA, UK, DE, and SE orders. Zero non-US/CA orders appear.
3. An order shipping to Canada with a UK billing address **is** imported. An order shipping to Germany with a US billing address **is not**.
4. Creating a label in ShipStation writes the tracking number back to the correct WooCommerce order and marks it Completed.
5. A repeated shipnotify for the same order changes nothing and returns 200.
6. Paging works: a window with more orders than one page size returns all of them across pages.
7. `store_dimension` has the new store with a verified `tax_treatment` flag, and `net_revenue` reconciles against a hand-checked sample of five orders.

## 10. Rollout

1. Build and deploy the endpoint. Verify export output against live Woo data **before** connecting anything in ShipStation.
2. Connect the Custom Store in ShipStation using the test URL, confirm the green connection check, then connect properly.
3. Import a narrow historical window first (a few days) and eyeball every order that lands.
4. Widen to live polling.
5. Only after live polling is clean: register the store in `store_dimension` and let it flow into the analytics pipeline.
6. If the stock Woo–ShipStation extension is currently connected, **disconnect it** so orders don't arrive twice from two stores.

## 11. Open questions for Pejman

1. Are US/CA DSA-website orders fulfilled from Houston (USF) or from Europe? This determines the ship-from location and whether they should land in the existing USF ShipStation account or a separate store.
2. Should the US/CA DSA orders be a **separate ShipStation store** from the USF stores, or merge into an existing one? Separate is strongly recommended for clean reporting.
3. Is the stock WooCommerce–ShipStation extension currently connected and importing, or is this a greenfield connection?
4. Any territories beyond US and CA to include later (Puerto Rico, US territories, Mexico)? Worth building the filter as a configurable country list rather than a hardcoded pair.
