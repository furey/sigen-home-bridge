---
title: Reaching it from away
description: The bridge has no login of its own. Here's how to keep it safe on your network, and how to reach it from outside the house without exposing it.
---

# Reaching it from away

The dashboard has no login. Anyone who can reach the port can see your readings. That's fine on your home network, and a problem the moment you try to reach it from outside the house. Here's how to handle both.

## On your home network

The readings are open by design. What you *can* lock is **changing** things.

Set a passcode under **Settings → Security** and the bridge rejects every settings change that doesn't carry a valid session. So a guest on your network can watch the dashboard but can't touch your settings.

Treat it as a deterrent for a shared home, not real security: there are no user accounts, the traffic is plain, and the readings stay open. Forgot the passcode? Delete `data/settings.json` (or just its `security` block) on the host and restart.

## From outside the house

::: danger Don't port-forward the raw dashboard
The app has no login of its own, passcode or not. Forwarding it to the internet, or putting a plain reverse proxy in front, exposes your readings to anyone who finds the address. Don't do it.
:::

The supported way to reach it from away is a **Cloudflare Tunnel** with **Cloudflare Access** in front:

- The **tunnel** publishes the dashboard over a secure public link, with no port opened on your router.
- **Cloudflare Access** puts a login wall at Cloudflare's edge. A visitor without a valid session is bounced to a sign-in page, and the app is never served to them. It's free for a personal user and needs a domain on your Cloudflare account.

The result is a dashboard you can open from anywhere, behind a login, with no VPN and the raw app never exposed. Sign-in can be a one-time code emailed to addresses you allow, so there's nothing else to wire up.

::: info If you run Google Home
Google's servers can't sign in, so the machine-to-machine addresses (`/fulfillment`, `/auth`, `/token`) have to stay public. Access lets you exempt just those and gate everything else. They're guarded only by the shared Google token, so keep that token secret. No Google Home means no exemption; gate the whole thing.
:::

## Step-by-step

The full walkthrough (creating the tunnel, gating the hostname, exempting the Google paths, and confirming it's live) is on the reference pages:

- [Cloudflare Tunnel & Access](/reference/cloudflare)
- [Security model](/reference/security)
