---
title: HTTP API
description: Every endpoint on the Express app, the self-describing /api/snapshot schema, and the history query parameters, with units and sign conventions.
---

# HTTP API

Everything runs through one Express app on `SERVER_PORT` (default 5163). Reads are open; the routes that change configuration are gated by the optional settings passcode (see [Security model](/reference/security)). All responses are JSON unless noted.

| Method        | Path                                         | Purpose                                                                        | Auth     |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------------------ | -------- |
| GET           | `/events`                                    | Server-Sent Events stream of the live state, pushed each poll                  | open     |
| GET           | `/api/state`                                 | Raw live state object (the fields the SSE stream carries)                      | open     |
| GET           | `/api/snapshot`                              | Curated, self-describing breakdown of the system (below)                       | open     |
| GET           | `/api/history`                               | Recent samples behind the trends chart (up to 20,000, or a downsampled window) | open     |
| GET           | `/api/history/stats`                         | Held sample count and time span                                                | open     |
| GET           | `/api/history/export`                        | Full retained series; `format=json\|csv`, `every=<seconds>`                    | open     |
| GET           | `/api/settings`                              | Public settings, with secrets stripped                                         | open     |
| GET           | `/api/homekit/pairing`                       | HomeKit setup URI, pairing code, and QR                                        | passcode |
| PUT           | `/api/settings`                              | Update settings                                                                | passcode |
| POST          | `/api/settings/reset`                        | Reset settings to the env seeds                                                | passcode |
| POST          | `/api/unlock`, `/api/lock`                   | Open or revoke a settings session                                              | open     |
| POST · DELETE | `/api/security/passcode`                     | Set or clear the passcode                                                      | passcode |
| POST          | `/api/test/gateway`, `/api/discover/gateway` | Test one gateway or sweep the LAN                                              | passcode |
| POST          | `/api/test/weather`, `/api/test/alert`       | Probe weather coordinates or fire a sample alert                               | passcode |
| POST · GET    | `/fulfillment`, `/auth`, `/token`            | Google Smart Home fulfillment and stub OAuth                                   | token    |

## `GET /api/snapshot`

`/api/state` is the raw poll output; `/api/snapshot` is the curated version meant for anything built outside the app. It wraps the live readings with the figures the dashboard derives (the battery time estimate, today's cost), labels the units, and stamps a `schema` version so a consumer can guard against later changes. It's assembled on demand in `server/snapshot.js` from the shared state, the history buffer, and settings; the cost and estimate maths live in `server/derive.js`, the server-side counterparts of the dashboard's `tariff.js` and `useBatteryEstimate.js`. Both `/api/snapshot` and `/api/history` answer compact JSON by default and indented JSON when the request carries a `pretty` query (`/api/snapshot?pretty`), which is what the Settings → System links open so the raw response reads cleanly in a browser tab.

```jsonc
/*
  Example `/api/snapshot` response.
*/
{
  "schema": 1,
  "generatedAt": "2026-06-26T03:15:01.289Z",
  "lastUpdated": "2026-06-26T03:14:56.566Z",
  "connected": true,
  "pollIntervalMs": 5000,
  "units": {
    "power": "W",
    "energy": "kWh",
    "temperature": "celsius",
    "currency": "AUD"
  },
  "power": {
    "solar": 2225,
    "solarSigen": 2225,
    "solarThirdParty": 0,
    "home": 6946,
    "homeGeneral": 6945,
    "smartPort": 4463,
    "grid": 4695,
    "battery": -26,
    "gridDirection": "import",
    "batteryDirection": "discharge"
  },
  "battery": {
    "soc": 100,
    "soh": 100,
    "capacityKwh": 40.3,
    "reserveSoc": 0,
    "energyRemainingKwh": 40.3,
    "direction": "discharge",
    "estimate": {
      "status": "idle"
    }
  },
  "energy": {
    "consumedToday": 40.8,
    "lifetime": {
      "pv": 1455.26,
      "consumed": 2388.99,
      "gridImport": 1102.89,
      "gridExport": 146.48,
      "batteryCharge": 1472.83,
      "batteryDischarge": 1400.17
    }
  },
  "weather": {
    "outdoorTemp": 15.9,
    "weatherCode": 1,
    "location": "Sydney",
    "latitude": -33.8829,
    "longitude": 151.0973
  },
  "tariff": {
    "currency": "AUD",
    "netPerHour": 0,
    "today": {
      "importCost": 0.0002,
      "feedIn": 0,
      "superExportCredit": 0,
      "zeroDrawCredit": 1,
      "zeroDrawMet": true,
      "supply": 1.65,
      "net": -0.6502
    }
  },
  "alerts": [],
  "devices": [
    {
      "type": "inverter",
      "unitId": 1,
      "model": "SigenStor EC 15.0 TP AU",
      "serial": "SGN-2026-000123",
      "status": "running",
      "activePower": 2219,
      "solarPower": 2518,
      "temperature": 54.2,
      "soc": 100,
      "soh": 100,
      "strings": [
        { "index": 1, "voltage": 296.5, "current": 1.96, "power": 581 },
        { "index": 2, "voltage": 472, "current": 1.59, "power": 750 },
        { "index": 3, "voltage": 539.6, "current": 2.2, "power": 1187 }
      ]
    },
    {
      "type": "smartLoad",
      "index": 1,
      "name": "Hot water",
      "power": 4463,
      "lifetimeEnergy": 955.63
    }
  ],
  "history": {
    "count": 111777,
    "firstT": 1781838901437,
    "lastT": 1782443696566,
    "links": {
      "recent": "/api/history",
      "export": "/api/history/export?format=json&every=300"
    }
  }
}
```

### Fields

Device readings pass through raw and signed, so the sign carries direction:

- **power** is watts. `grid` is positive on import, negative on export; `battery` is positive charging, negative discharging (it's derived, see the [Register map](/reference/register-map#battery-power-is-derived)). `gridDirection` and `batteryDirection` restate the sign as `import`/`export`/`idle` and `charge`/`discharge`/`idle` past a small deadband. `solar` is total PV; `solarSigen` and `solarThirdParty` split it into the Sigenergy DC arrays and any AC-coupled third-party inverter the gateway meters (`solarThirdParty` is 0 without one). `home` is total house load including any EV charger; `homeGeneral` excludes the chargers and trackable smart loads (`null` when that register isn't supported); `smartPort` is the combined draw of the detected Smart Port loads (`null` when none are detected).
- **battery** carries `soc` and `soh` percent, the installed `capacityKwh` (the Settings → Battery value, falling back to the rated register), `energyRemainingKwh`, and `estimate`. The estimate's `status` is `idle`, `warming`, or `ready`; a ready one adds `direction`, `target` (`full`, `reserve`, or `empty`), `minutesRemaining`, `etaIso`, and `energyToGoKwh`.
- **energy** is kWh: `consumedToday` since midnight, plus the lifetime counters.
- **weather** appears only when weather is enabled; its temperature follows `units.temperature`.
- **tariff** appears only once a rate, window, or credit is configured. `netPerHour` prices the current grid flow at the active rate (positive a credit, negative a cost); `today` is the running breakdown for the local day (`importCost`, `feedIn`, `superExportCredit`, `zeroDrawCredit`, `supply`, `net`), the same object the Home tile's cost fullscreen renders (see [Energy tariffs](/reference/tariffs)). Money and computed kWh figures are rounded to four decimals.
- **devices** is the per-device breakdown the bridge discovers beyond the plant totals. Each inverter the gateway answers for gets an entry carrying `type: "inverter"`, `unitId`, `model`, `serial`, `status` (`standby`/`running`/`fault`/`shutdown`), `activePower` (W), `solarPower` (the DC total of its strings, W), `temperature` (°C), `soc`/`soh` (%), and a `strings` array of `{ index, name, voltage, current, power }` (`name` from Settings → Solar, defaulting to `String N`, keyed per inverter serial). Each active Smart Port load gets an entry carrying `type: "smartLoad"`, `index` (its slot number, 1–24), `name` (from Settings, defaulting to `Smart load N`), `power` (signed W), and `lifetimeEnergy` (kWh since commissioning). The array is empty on a plant the bridge can't enumerate, so a consumer should treat it as optional. See [Devices & sources](/reference/devices).
- **history** echoes the stats and links to the history endpoints for follow-on queries; **alerts** is the active set, identical to `/api/state`, each entry carrying the alert's `id`, `name`, `trigger` type, current `message`, a `condition` object (the watched `value`, its inclusive `comparison` of `atOrAbove` or `atOrBelow`, the `threshold`, and the `unit`), and `since`.

The envelope (`schema`, `generatedAt`, `lastUpdated`, `connected`, `pollIntervalMs`, `units`) is always present, and a field is `null` when its register isn't supported on your firmware, the same contract as `/api/state`. The snapshot is read-only and unauthenticated like every other read, so anyone who can reach the dashboard can read it; keep it on the LAN.

## `GET /api/history`

`/api/history` returns the recent samples behind the trends chart, oldest first, as a bare array (up to 20,000, the in-memory live window). Five optional query params shape it without changing that default, so the dashboard's own bare fetch is unaffected: `order=desc` flips it newest first, `limit=<n>` caps it to the most recent n (1 to 20,000), `since`/`until` bound the time range inclusively (epoch milliseconds or an ISO timestamp), and `every=<seconds>` returns one downsampled row per interval across the window instead of raw rows, bypassing the 20,000 cap (floored server-side so a single response stays bounded) for the multi-day views the trends chart pans over. They compose, so `?order=desc&limit=100` is the latest hundred newest first, and paging further back is a keyset walk rather than an offset: take the oldest `t` you got and ask again with `&until=<that t minus 1>`, which stays stable even as new samples land and old ones trim. The Settings → System link opens `?order=desc&limit=200&pretty` so the raw view leads with the latest readings instead of a full oldest-first dump. For the durable series beyond the live window, or a thinned copy, use `/api/history/export`.
