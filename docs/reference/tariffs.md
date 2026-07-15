---
title: Energy tariffs
description: The settings schema, rate resolution, the shared pure engine, and exactly what the cost model does and doesn't handle.
---

# Energy tariffs

Settings → Tariff adds a `tariff` section to `settings.json`: `showOnDashboard` (the display toggle), `costMode` (`perDay` | `perHour`), a three-letter `currency`, a `supplyChargePerDay`, a fallback `importRate` and `exportRate` (per kWh), `importWindows` and `exportWindows` (each a list of `{ start, end, rate }`), and credits: `superExportCredit` (`{ enabled, start, end, capKwh, rate }`) and `zeroDrawCredit` (`{ enabled, start, end, perDay }`). It is validated server-side like every other section but drives no subsystem; nothing reacts to a change, so it flows straight through to the UI with no listener. The figure's colour comes from two themeable palette slots, `cost` (net paying) and `credit` (net earning).

Rate resolution mirrors the poll schedule (`server/schedule.js`): the active rate at a given time is the first window whose `[start, end)` contains the local minute-of-day, or the fallback rate if none match. A window with `start > end` wraps past midnight, and a free period is simply a window with `rate: 0`.

Both surfaces share one pure engine, `ui/src/lib/tariff.js`, so the figures stay consistent and the maths is unit-tested (`server/tests/tariff-cost.test.js` imports the same module). Computation runs in the browser, which means windows and the day boundary use the viewer's local timezone and so follow daylight saving automatically.

The dashboard and its `/cost` fullscreen read through `useCostReadout`, which returns the signed amount (negative = net cost, positive = net credit), the currency, the `costMode`, and a contextual label (`Today's Cost Estimate` or `Hourly Cost Estimate`) alongside a short form ("Today's Estimate" / "Hourly Estimate") the dashboard tile swaps in below 768px. `MoneyValue` renders the figure so a minus reads as money in your favour: a credit shows a leading `−` in the themeable `credit` colour, a cost shows plain (no sign) in the `cost` colour, and idle is a plain zero in grey, with the currency symbol and any minus dropped to a darker tint of that colour (the same trick the flow arrows use).

## The two surfaces

- **Dashboard** (Home tile, gated on `showOnDashboard`): the tile splits like the battery tile (home consumption on the left, the cost figure on the right at the full metric font) and each half routes to its own fullscreen (`/cost` for the cost view). In `perDay` mode (default) the figure is today's net so far; in `perHour` mode it is the instantaneous rate, `costPerHour` × the live grid power (import rate when `gridPower > 0`, export rate when exporting), negated so it shares the net sign convention. A 50 W grid deadband (applied in both `costPerHour` and the daily integration) suppresses the gateway's idle ±0.01 kW jitter, so a near-balanced grid reads as a steady zero instead of flickering.
- **Cost fullscreen** (`/cost`): `dailyCost` walks today's history samples, integrating each consecutive pair trapezoidally into kWh and skipping gaps longer than fifteen minutes so an outage doesn't smear the figures. Each interval's kWh is attributed to the rate active at its midpoint, tallying import cost and feed-in separately. The super-export credit caps the day's in-window export kWh at `capKwh` and applies its bonus rate; the zero-draw credit pays `perDay` if no grid import lands in its window all day. Net is feed-in plus credits minus import cost minus the full daily supply charge, shown as the headline figure and again as a labelled total under the breakdown.

## What it doesn't model

The model is deliberately incomplete: it does not handle daily volume caps (such as a free import window limited to N kWh/day), demand charges, GST or rounding, tiered or seasonal rates, controlled-load circuits, or meter-time schemes where a window is defined in standard time and shifts an hour under daylight saving (re-enter such a window in local time at changeover).
