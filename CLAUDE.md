# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Run dev server (http://localhost:3000)
npm run build    # Production build
npm test         # Run tests (Jest via react-scripts)
```

Environment variables required (copy `.env.example` to `.env`):
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`

## Project overview

**DSA Seat Factory OMS** — order management system for DSA Seat Factory (European brand of United Seat Factory / USF). Orders come from eBay UK, eBay EU (DE, FR, IT, ES), and the DSA WooCommerce site.

- **Live URL:** https://seatcover-oms.vercel.app
- **GitHub:** https://github.com/Pejmana1978/seatcover-oms
- **Supabase project ref:** nvqhgkqjlvymnwcsfbee

**DSA is restricted to non-US sales** — never propose features that route US customers through it.

## Architecture

**SeatCover OMS** is a Create React App (no TypeScript) order management system for a seat cover manufacturer. It uses Supabase (Postgres + Auth + Storage) as the backend and deploys to Vercel.

### Data flow

All orders are fetched once at the top level (`Dashboard.js`) and passed down as `orders` / `setOrders` props. There is no global state library — every page receives and mutates the same in-memory array. Mutations go through `src/lib/api.js` which wraps the Supabase JS client (`src/lib/supabase.js`).

### Authentication & roles

`AuthContext.js` holds the Supabase session and fetches the user's row from the `profiles` table. The `profile.role` field drives navigation — `ROLE_PAGES` in `constants.js` maps each role to the pages it can see:

| Role | Pages |
|------|-------|
| `admin` | everything |
| `sales` | orders, stats, archive, customer service |
| `production` | production queue only |
| `shipping_us` | US shipping only |
| `shipping_sweden` | Sweden shipping + Shipping (Customer) |

### Pages

- **OrdersPage** — full order list with search/filter, create/edit/delete
- **ProductionPage** — orders in `Verified` / `In Production` stages; advance stage buttons
- **ShippingUSPage** — orders in `Production Complete`; generates UPS labels via `/api/ups-label`
- **ShippingSwedPage** — orders in `Shipped to Sweden` / `Shipped to Customer`; UPS labels + packing slips
- **StatsPage** — read-only charts/summaries over all orders
- **ArchivePage** — delivered/archived orders
- **StockPage** — Sweden warehouse stock (`stock` table); decrement on dispatch
- **UsersPage** — admin-only; invite users via Supabase Auth

### Order lifecycle (stages in `constants.js`)

`New` → `Verified` → `In Production` → `Production Complete` → `Shipped to Sweden` → `Shipped to Customer` → `Delivered`

### Vercel API routes (`/api/`)

Serverless functions under `api/` — ALL of them require a signed-in Supabase user (Bearer token validated by `api/_auth.js`; clients attach it via `authHeaders()` in `src/lib/api.js`):
- `ups-label.js` — calls UPS API to generate a shipping label PDF
- `ups-track.js` — calls UPS tracking API
- `ebay-sync.js` — proxies to the Supabase Edge Function `ebay-sync`
- `ebay-tracking.js` — proxies to the Supabase Edge Function `ebay-tracking`
- `invite-user.js` — admin-only user invite (needs the service-role key, so it can't run in the browser)

### Supabase Edge Functions (`supabase/functions/`)

- `ebay-sync/` — Deno function that pulls recent eBay orders and upserts them into `orders`
- `ebay-backfill/` — one-off backfill variant

### Key utilities

- `src/lib/printPackingSlip.js` — opens a new browser window and writes a full HTML packing slip (eBay-style invoice format)
- `src/components/OrderModal.js` — detail/edit modal shared by multiple pages; includes eBay title parser that auto-fills car/position/material/color fields
- `src/components/StageProgress.js` — visual stage stepper shown inside the order modal

### Database schema

Defined in `supabase-schema.sql`. Main tables: `profiles`, `orders`, `stock`. Photos stored in Supabase Storage bucket `order-photos` as a JSON array (`photos` column on orders). The schema in the repo reflects the initial version; the live `orders` table has additional columns (e.g. `address`, `tracking_number`, `label_pdf`, `material`, `position`, `thumbnail`, `quantity`, `order_date`) added after initial deployment.

## eBay integration

- **App ID:** `DSAAutoS-SeatCove-PRD-7f61be8bd-0f316e5d`
- **RuName:** `DSA_Auto_Seat_F-DSAAutoS-SeatCo-jaddgi`
- Order sync is handled by the Supabase edge function `ebay-sync`
- Thumbnail fetching uses client credentials OAuth against the eBay Browse API
- The function pulls thumbnails per item and stores them with the order record

## Code conventions

- Sort all order lists **latest-first** (newest at top) by default
- Order thumbnails can be auto-fetched from eBay OR manually replaced by uploading a custom image; both must be supported
- Production sheets must include the order thumbnail **and** any uploaded photos
- Production sheets must **not** show price (workshop staff shouldn't see margins)
- File uploads should support drag-and-drop with preview thumbnails and an X to remove

## How Pejman wants to work

- **He does not write code.** Don't say "you'll need to edit X" — do it yourself.
- **Avoid terminal commands when possible.** Use MCP servers (Supabase, Vercel, GitHub) instead of asking him to run CLI commands.
- **Show diffs before applying.** He wants to see what's changing.
- **Deploy to Vercel only after he approves the diff** for that change.
- **One feature at a time.** Don't bundle multiple features into one diff.
- **Push back if a request seems wrong.** He prefers honest pushback to silent compliance.

## Things to never do without explicit approval

- Drop or truncate any Supabase table
- Force-push to main
- Delete Vercel deployments
- Modify RLS policies on tables not created in this session
- Change the eBay credentials or edge function secrets

## Known remaining work

Pick these up in order unless told otherwise:

1. ✅/❌ Sort all order lists latest-first
2. ✅/❌ Manual thumbnail replacement by clicking the thumbnail
3. ✅/❌ Production sheet shows thumbnail + uploaded photos (drag-drop, preview, X-to-remove)
4. ✅/❌ Remove price from production sheet entirely
5. ✅/❌ Multi-order print selection (checkbox + "Print selected production sheets" button → batched PDF)

Update the checkboxes as items are completed and commit this file alongside the change.
