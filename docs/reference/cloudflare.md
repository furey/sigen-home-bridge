---
title: Cloudflare Tunnel & Access
description: Publish the bridge over HTTPS with no open router port, then gate it at Cloudflare's edge so it has the login the app itself lacks.
---

# Cloudflare Tunnel

A Cloudflare Tunnel exposes the bridge over HTTPS without opening a port on your router. Google Home requires it (Google's servers call a public fulfillment URL rather than reaching your LAN), and it's also the cleanest way to reach the dashboard itself from outside; pair it with Cloudflare Access ([below](#remote-access-with-cloudflare-access)) and you get an authenticated public URL with no VPN.

You need a domain on Cloudflare for this. The bundled sidecar uses a remotely-managed (token) tunnel, which routes a public hostname on a domain you've added to your Cloudflare account; any domain on the free plan works, and you can register one through Cloudflare if you don't have one. That requirement is real: Cloudflare's free `*.trycloudflare.com` quick tunnels hand you a throwaway URL that changes on every restart and can't be gated with Access, so they suit neither a stable Google fulfillment URL nor a gated dashboard. Create the tunnel in Cloudflare Zero Trust, route your hostname to `http://localhost:5163`, copy the token into `CLOUDFLARE_TUNNEL_TOKEN`, then start the sidecar with its profile:

```bash
docker compose --profile tunnel up -d
```

The `cloudflared` service in `compose.yaml` runs the tunnel; it sits behind the `tunnel` profile and is off by default. Skip all of this if you only use HomeKit and don't need a remote dashboard.

## The QUIC transport gotcha

By default `cloudflared` uses the QUIC transport over UDP. On hosts that cap the UDP receive buffer below what QUIC wants (a Synology NAS, for one), one of the four edge connections can wedge in a reconnect loop; the logs then show repeated `control stream encountered a failure` and `failed to run the datagram handler` errors even though the tunnel still serves. Set `TUNNEL_TRANSPORT_PROTOCOL=http2` on the service to switch to TCP/7844, which sidesteps the QUIC/UDP path. For this read-only, low-bandwidth bridge the transport choice makes no practical difference to performance.

## Remote access with Cloudflare Access

The tunnel alone publishes the dashboard to anyone who learns the hostname, and the app has no login of its own, so don't stop there. Cloudflare Access (part of Zero Trust, free for a personal user) puts an identity check at Cloudflare's edge: a request without a valid Access session is bounced to a sign-in page at `https://<your-team>.cloudflareaccess.com/...` and only reaches the tunnel after it matches a policy. The result is a dashboard you can open from anywhere, authenticated, with the unauthenticated origin never exposed to the public internet.

Set it up in Zero Trust → Access → Applications:

1. **Gate the whole hostname.** Add a self-hosted application whose domain is your tunnel hostname with no path, and give it one policy: action **Allow**, include **Emails** = your address (add more for family). With no external identity provider configured, Cloudflare's built-in **One-time PIN** is the login method, so a visitor enters an allowed email, gets a one-time code by email, and is let in; nothing else to wire up.
2. **If you use Google Home, exempt its three paths.** Google's servers can't do an interactive login, so add a second self-hosted application scoped to the three machine-to-machine paths (`/fulfillment`, `/auth`, and `/token` on the same hostname) with one policy: action **Bypass**, include **Everyone**. Access evaluates Bypass first and the most specific hostname-plus-path match wins, so those three stay public while everything else stays gated. They remain guarded only by the shared Google token (`GOOGLE_AUTH_TOKEN`), so keep it secret. If you don't run Google Home, skip this second app and the entire hostname is gated.
3. **Confirm it's live.** From off your LAN, `curl -sS -o /dev/null -w "%{http_code} %{redirect_url}\n" https://<your-host>/api/state` should return a `302` to `<your-team>.cloudflareaccess.com`, and a bypassed Google path (for example `/token`) should not redirect there. Edge changes propagate in well under a minute.

See also the [Security model](/reference/security) for exactly what's open and what the passcode locks.
