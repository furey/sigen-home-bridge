---
title: The JSON API
description: Everything the dashboard shows is one plain web request away. Poll it into a script, a spreadsheet, Home Assistant, or Node-RED.
---

# The JSON API

Everything the dashboard shows is also a plain web request, so you can build your own readout, log the numbers to a spreadsheet, or feed them into Home Assistant, Node-RED, or a shell script.

```sh
curl http://<host-ip>:5163/api/snapshot
```

## What you get back

`/api/snapshot` returns one tidy object with the whole picture:

- **Live power flows** (solar, battery, grid, home) in watts, signed for direction.
- **Battery** charge and health, and a time-to-full/empty estimate worked out for you.
- **Energy** totals for today and lifetime.
- **Weather** (if it's on).
- **Alerts** that are currently active.
- A **per-device breakdown** of each inverter (model, status, power, temperature, each solar string) and each active Smart Port load.
- **Today's cost breakdown**, once you've entered tariffs.

Every response also carries a `schema` version, the units in use, and timestamps, so a script can guard against later changes.

```jsonc
{
  "schema": 1,
  "generatedAt": "2026-06-26T03:15:01.289Z",
  "connected": true,
  "power": {
    "solar": 2225,
    "home": 6946,
    "grid": 4695,
    "battery": -26,
    "gridDirection": "import",
    "batteryDirection": "discharge"
  },
  "battery": {
    "soc": 100,
    "soh": 100,
    "capacityKwh": 40.3,
    "estimate": { "status": "idle" }
  }
  // …energy, weather, tariff, alerts, devices, history follow
}
```

The signs carry meaning: `grid` is positive when you're importing and negative when exporting; `battery` is positive charging, negative discharging.

## History

- `GET /api/history` returns the recent readings behind the trends chart.
- `GET /api/history/export?format=json&every=300` returns your full stored history, thinned to one row every 300 seconds. Swap `format=csv` for a spreadsheet.

::: warning Keep it on your network
The snapshot is read-only and has no login, like the rest of the dashboard. Anyone who can reach the port can read it, so keep it on your home network. To reach it from outside, see [Reaching it from away](/guide/remote-access).
:::

::: tip Want the nitty-gritty?
Every endpoint, every field, the units, and the sign conventions are on the reference page: [HTTP API](/reference/http-api).
:::
