---
title: Architecture
description: One process, one persistent Modbus socket, four registers on a timer, pushed to three consumers. Plus the poller state machine.
---

# Architecture

```mermaid
flowchart TB
  subgraph lan["Home LAN"]
    gw["Sigenergy gateway<br>Modbus TCP :502"]

    subgraph bridge["sigen-home-bridge container"]
      poller["Modbus poller<br>schedule-aware loop"]
      weather["Weather poller<br>Open-Meteo"]
      state["Shared state<br>+ pub/sub"]
      hist["History buffer<br>retention window"]
      hk["HomeKit bridge<br>hap-nodejs"]
      http["Express server<br>SSE · REST · fulfillment · static UI"]
      cfg[("settings.json")]
      histdb[("history.db<br>SQLite · WAL")]
    end

    home["Apple Home<br>iPhone · iPad · HomePod"]
    browser["Web dashboard<br>wizard + settings"]
    apiclient["JSON API client<br>scripts · Home Assistant"]
  end

  tunnel["Cloudflare Tunnel<br>HTTPS"]
  google["Google Home"]
  meteo["Open-Meteo + IP geo"]

  gw -->|"read 4 registers"| poller
  poller --> state
  poller --> hist
  hist -->|"GET /api/history · export"| http
  hist -->|"write-through insert"| histdb
  meteo -->|"current temp"| weather
  weather --> state
  state --> hk
  state --> http
  hk -->|"Bonjour / mDNS"| home
  http -->|"SSE /events"| browser
  http -->|"GET /api/snapshot · history"| apiclient
  browser -->|"PUT /api/settings"| http
  http --> cfg
  cfg -->|"live reload"| poller
  cfg -->|"live reload"| weather
  google --> tunnel
  tunnel -->|"POST /fulfillment"| http
```

A single process holds one persistent Modbus TCP socket to the gateway and polls four registers on a timer (battery power is derived from them). Each cycle writes to a shared in-memory state object and pushes it to three consumers:

- **HomeKit** via `hap-nodejs`, advertised over your LAN with Bonjour. Fully local, no cloud.
- **Google Home** via Smart Home fulfillment over HTTPS (needs a tunnel; see [Google Home fulfillment](/reference/google-home)).
- **The dashboard** via Server-Sent Events, so the browser updates the instant a poll completes.

Each cycle is also appended to an in-memory history buffer that backs the dashboard's trends chart, served over `GET /api/history` (the recent 20,000 samples, or a downsampled slice when the chart reaches further back). The buffer is the read cache; the durable copy is a SQLite database at `/data/history.db` (built-in `node:sqlite`, WAL mode), written through one row per poll rather than rewriting a snapshot, so a week of 5-second readings costs a few MB of writes a day instead of gigabytes (safe on an SD card or SSD). A configurable retention window (Settings → History, default 7 days) bounds both the buffer and the database; older samples are trimmed in memory on each poll and pruned from the database on a five-minute timer. The full retained set exports as CSV or JSON, optionally thinned to one row per interval, via `GET /api/history/export`; `GET /api/history/stats` reports the held count and span. An existing `history.json` from an older build is imported into the database once on first boot and renamed to `history.json.imported`.

A separate timer fetches the outdoor temperature from Open-Meteo and merges it into the same state. All configuration (gateway, polling, weather, HomeKit, Google) is editable in the dashboard's setup wizard and settings page, saved to `settings.json`, with most changes applied live (gateway edits reconnect the socket; HomeKit and the server port need a restart).

The gateway address can also be auto-detected. `POST /api/discover/gateway` (the **Scan** button on the gateway field in the wizard and settings) derives the /24 around each non-internal IPv4 interface (host networking means these are the real LAN interfaces), attempts a plain TCP connect to the Modbus port on all 254 hosts (64 concurrent, 600 ms timeout), then confirms each answering host with an actual SoC register read so only a real Sigenergy gateway qualifies. A clean sweep of an empty subnet takes about 3 seconds; the wizard runs it automatically when the gateway field is blank, fills the field on a single match, and offers a pick list if several answer.

## Poller lifecycle

If the gateway drops, the poller logs the error, marks the state disconnected, and retries on a fixed delay without ever crashing or zeroing the last known values.

```mermaid
stateDiagram-v2
  [*] --> Connecting
  Connecting --> Reading: socket open
  Connecting --> Disconnected: connect error
  Reading --> Waiting: update state · publish · log
  Reading --> Disconnected: read error
  Waiting --> Reading: timer fires (schedule interval)
  Disconnected --> Connecting: after RECONNECT_DELAY_MS
  note right of Disconnected
    last known values are kept and served
    while the state shows offline
  end note
```

The weather poller is similarly failure-tolerant: a failed fetch gets one immediate second attempt, and until the first reading lands the poller tries every 30 seconds (the same cadence covers a failed location lookup) before settling into the normal refresh interval, so a flaky API briefly delays the temperature instead of hiding it until the next restart.
