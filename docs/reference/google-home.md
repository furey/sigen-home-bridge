---
title: Google Home fulfillment
description: The SYNC/QUERY/EXECUTE/DISCONNECT intents as plain Express handlers, the two-trait device mapping, the minimal OAuth, the connection status, and the display trade-offs.
---

# Google Home fulfillment

Google has deprecated the Actions Console and is steering integrations toward cloud-to-cloud rather than self-hosted fulfillment, and the old `actions-on-google` library is unmaintained. This project therefore implements the SYNC, QUERY, EXECUTE, and DISCONNECT intents as plain Express handlers with no external library. Everything is read-only; EXECUTE is a no-op.

```mermaid
sequenceDiagram
  participant G as Google Home
  participant T as Cloudflare Tunnel
  participant B as Bridge (Express)
  G->>T: OAuth /auth then /token
  T->>B: forward
  B-->>G: static bearer (client secret checked)
  G->>T: POST /fulfillment · SYNC
  T->>B: forward
  B-->>G: battery + four power devices
  G->>T: POST /fulfillment · QUERY
  T->>B: forward
  B-->>G: current readings from state
```

The bridge ships a minimal OAuth for personal use that hands Google a static bearer: the Auth token in Settings → Google Home (seeded from `GOOGLE_AUTH_TOKEN`). `/auth` redirects only to Google's account-linking addresses (`https://oauth-redirect.googleusercontent.com/r/…` and its sandbox twin), with a random one-time code that expires after 10 minutes. `/token` first checks that the client secret, sent in the form body or as HTTP Basic auth, equals the auth token. It then trades a valid code (once) or a refresh token equal to the auth token for the bearer. The Client ID is not checked.

The bridge keeps the time and outcome of the last accepted and last rejected Google request in memory (`server/google-status.js`), never the token or the caller's address. Only a `/fulfillment` call with the right bearer or a `/token` call with the right client secret counts as accepted. Settings → Google Home shows it beside **Check Google connection**, and it resets when the bridge restarts.

## Two traits for the readings

Google's device model is stricter than HomeKit's, so the readings map to two different traits. The battery is a genuine energy store, so it uses the `EnergyStorage` trait on a `SENSOR` device: the bridge reports `descriptiveCapacityRemaining` (Critically low through Full, mapped from the state of charge), the percentage, and charging state, and Google draws a real battery tile.

The power metrics are the awkward ones. Google's `SensorState` trait only models a closed list of sensor types (air quality, CO, CO₂, particulates, and similar) with fixed units; there is no watt unit, and a custom sensor name renders as a blank tile. The one trait that reliably shows an arbitrary read-only number is temperature, so each power metric rides in on a query-only `TemperatureControl` device carrying its live wattage as `temperatureAmbientCelsius`. Google labels the value with a degree symbol and rounds it to a whole number, so you read "285°" as 285 W. It is misleading but legible, and it mirrors what the HomeKit integration already does with temperature sensors. HomeKit shows the same flows in kW because it renders one decimal place; Google rounds, so the bridge sends whole watts there to keep sub-kilowatt flows from collapsing to zero.

## Configurable trade-offs

Both halves are configurable in Settings → Google Home, since Google's trade-offs cut different ways for different people. The battery can render as the `EnergyStorage` tile (charge level and charging state, but voice answers with a descriptive word like "OK") or as a plain percentage reading on a temperature device (voice speaks the number, but there is no battery glyph). The power metrics can read in watts (full resolution), kilowatts (tidy numbers, but Google rounds off anything under half a kilowatt), or be hidden (a blank `SensorState` device, no misleading degree unit). Each device's name is editable too. The settings are read per request, so they take effect on the next sync; changing the display mode swaps the device's trait, so Google needs a relink to pick it up. For a fully local, fully supported setup, use [HomeKit](/reference/apple-home).
