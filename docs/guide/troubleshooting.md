---
title: Troubleshooting
description: "The common snags, and the fix for each: gateway connection, Apple Home discovery, the degrees display, frozen tiles, weather, cost figures, and settings that won't apply."
---

# Troubleshooting

The common snags and the fix for each. Still stuck? Compare notes in [Discussions](https://github.com/furey/sigen-home-bridge/discussions).

## The bridge can't connect to the gateway

- Use the IP from a network scan, not the one shown in the mySigen app (see [Getting started](/guide/getting-started#if-scan-can-t-find-it)).
- Check the local data feed is still switched on in mySigen, and that the unit ID is `247` (the default).
- Use the **Scan** and **Test connection** buttons in **Settings → Gateway** to check from the bridge's side.
- Make sure the gateway didn't change address. Give it a fixed address on your router if you haven't.

## Apple Home can't find the accessory, or is slow

- The container must run with host networking (the bundled `compose.yaml` already does this).
- On a NAS, or any host with extra Docker networks, set `HOMEKIT_BIND` to your network interface (e.g. `eth0`) or its IP, so the bridge doesn't advertise on unreachable internal `172.x` addresses.
- Your phone must be on the same network as the host. Apple's local discovery doesn't cross network segments without help.

## The Home app shows degrees instead of kilowatts

That's by design; the Home app has no power sensor, so the bridge borrows a temperature one. See [Reading the numbers](/guide/apple-home#reading-the-numbers).

## The dashboard tiles froze

- The footer shows the connection state and last update. If the gateway dropped, the bridge keeps the last known values and reconnects on its own.
- If a home-screen app on iOS has gone stale, tap the dashboard title to reload it.

## No outdoor temperature in the header

Weather needs outbound internet (Open-Meteo). The first run works out where you are from the server's public address; set `LATITUDE` / `LONGITUDE` in settings if it guessed wrong, or turn weather off.

## The cost figures look wrong

They're an estimate from the rates you enter, not a bill. Check **Settings → Tariff** has the right rates, windows (in local time), and currency, and that enough history has built up for today. See [Tariffs & cost](/guide/tariffs) for what it can't model.

## A settings change didn't apply

Almost everything applies live, but the Apple Home fields and the server port are marked "requires restart". A `docker compose restart` picks them up.

## I changed `.env` but nothing happened

`.env` only seeds the *first* boot. Once you've saved settings in the dashboard, those win. Change it in Settings instead, or use Reset to fall back to the `.env` seeds.

## Cloudflare Tunnel logs fill with "control stream encountered a failure"

`cloudflared` defaults to a transport (QUIC over UDP) that some hosts (a Synology NAS is the usual culprit) can't give enough buffer for. One of the four edge connections then wedges in a reconnect loop while the other three carry traffic, so the tunnel still serves but the logs fill with errors.

The fix is to force TCP instead. Add `TUNNEL_TRANSPORT_PROTOCOL=http2` to the `cloudflared` service's `environment`, then recreate the container. A startup line about the UDP receive buffer being smaller than wanted is harmless on this setting.
