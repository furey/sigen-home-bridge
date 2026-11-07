---
title: Local development
description: Running the bridge and UI locally, the project layout, the npm scripts, verifying the gateway with the probe, and how the README screenshots and walkthrough video are captured.
---

# Local development

```bash
npm run install:all
npm run dev
```

`npm run dev` runs the bridge (with `--watch`) and the Vite dev server together (a `predev` script first kills stale listeners on the HomeKit and HTTP ports, so orphaned processes don't cause `EADDRINUSE`). Vite serves the UI on `http://localhost:5173` and proxies `/events`, `/api`, and `/fulfillment` to the bridge on port 5163, so the dashboard works against a live poller. In development, pairing and settings persist to `./data`.

Edit the UI on `http://localhost:5173`, not 5163. Port 5163 (and `npm start`, and the Docker container) serves the prebuilt `ui/dist`, so changes to `ui/src` won't show there until you `npm run build`. Hot reload only happens on the Vite port; if you're loading 5163 and source edits seem to do nothing, that's why.

## Project layout

```
sigen-home-bridge/
├── server/
│   ├── index.js        entry point; wires poller, HomeKit, HTTP, weather
│   ├── config.js       environment seed and resolved paths
│   ├── modbus.js       Modbus TCP client, poll loop, reconnect, gateway test
│   ├── devices.js      per-inverter discovery + reads (strings, power, temp) by unit ID
│   ├── discover.js     LAN sweep + register fingerprint behind the Scan button
│   ├── schedule.js     resolves the poll interval from time windows
│   ├── settings.js     persisted, live-editable config (all sections) + listeners
│   ├── security.js     optional settings passcode: scrypt hash, session tokens, lockout
│   ├── oauth.js        Google account-linking OAuth: /auth one-time codes, /token checks
│   ├── hosts.js        Host allow-list and same-origin JSON check for /api and /events
│   ├── google-status.js Last accepted and rejected Google request, in memory
│   ├── weather.js      outdoor temperature from Open-Meteo
│   ├── state.js        shared in-memory state and pub/sub
│   ├── history.js      reading history in SQLite (write-through), retention + CSV/JSON export
│   ├── derive.js       cost + battery-estimate maths behind /api/snapshot (mirrors the UI)
│   ├── snapshot.js     assembles the /api/snapshot system breakdown
│   ├── triggers.js     declarative alert-trigger catalogue (engine, validation, UI)
│   ├── alerts.js       alert engine: evaluates the alert list, debounce, dispatch
│   ├── homekit.js      HAP bridge and accessories
│   ├── google.js       Google Smart Home intent handlers
│   ├── server.js       Express app: SSE, REST, static UI, route wiring, passcode gate
│   ├── probe.js        one-shot Modbus read for verification
│   └── tests/          Vitest unit tests
├── ui/                 Vue 3 + Vite + Tailwind dashboard
│   └── src/
│       ├── App.vue
│       ├── router.js
│       ├── lib/         metrics.js, help.js, tariff.js, trendWindow.js, pageReveal.js, … (+ Vitest tests)
│       ├── directives/  reveal.js (staggered page reveal)
│       ├── composables/ useStateStream, useHistory, useSettings, useDashboardView, …
│       ├── public/      favicon set
│       └── components/  Dashboard, TrendsView, MetricFullscreen, Settings, SetupWizard, InfoTip
├── docs/
│   ├── screenshots/    README captures (desktop, tablet, phone)
│   └── .vitepress/     this documentation site
├── Dockerfile          two-stage: build the UI, run the server
├── compose.yaml        bridge + optional cloudflared (tunnel profile)
├── .env.example
└── LICENSE
```

## Scripts

Run from the repository root.

| Script                | Action                                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| `npm run install:all` | Install root, server, and UI dependencies                                    |
| `npm run dev`         | Run the bridge and the Vite dev server together                              |
| `npm run build`       | Build the UI into `ui/dist`                                                  |
| `npm start`           | Start the bridge (serves the built UI)                                       |
| `npm test`            | Run the server and UI unit tests                                             |
| `npm run probe`       | Read the gateway once and print decoded values                               |
| `npm run screenshots` | Recapture the README screenshots (Docker + Playwright)                       |
| `npm run walkthrough` | Record and publish the walkthrough video (Docker + headless Chrome + ffmpeg) |
| `npm run og`          | Regenerate the docs social preview card (Docker + Playwright)                |

## Verifying the gateway {#verifying-the-gateway}

Before trusting the poller, confirm the registers decode correctly against your actual hardware. Run the probe from a machine that can reach the gateway:

```bash
SIGEN_IP=192.168.1.50 npm run probe
```

It connects and sweeps a catalogue of candidate registers grouped by category (system and status, power flows, battery and ESS, energy counters), printing the decoded value and unit for each and a dash for any the firmware doesn't answer, so you can see at a glance which signals your unit exposes beyond the four the poller uses. The per-inverter registers (MPPT strings, cell temperatures, model and serial) and the EV charger sit on their own Modbus unit IDs; set `SIGEN_INVERTER_ID` and/or `SIGEN_AC_CHARGER_ID` to add those sweeps:

```bash
SIGEN_IP=192.168.1.50 SIGEN_INVERTER_ID=1 npm run probe
```

Reads it does not recognise are skipped rather than fatal, so a clean run against your hardware is the fastest way to confirm what's worth wiring into the poller, HomeKit, or Google.

## Regenerating the README screenshots

The PNGs in `docs/screenshots/` are captured from the running app by `scripts/capture-screenshots.sh` (`npm run screenshots`). It pulls the official Playwright Docker image (no host install), drives headless Chromium across desktop, tablet, and phone viewports, and writes the PNGs back into `docs/screenshots/` owned by you. One run produces the whole set.

Point it at any instance carrying live history with `SIGEN_URL`, so the trends charts render real readings instead of an empty system:

```sh
# Against a local bridge (default http://localhost:5163)
npm run screenshots

# Against a live instance, re-shooting only one group
SIGEN_URL=http://bridge.lan:5163 npm run screenshots data

# Pin a different Playwright version (default 1.60.0)
PLAYWRIGHT_VERSION=1.59.0 SIGEN_URL=http://bridge.lan:5163 npm run screenshots
```

The optional argument limits the run to a group: `data` (dashboard, trends, devices, and fullscreen shots across every viewport), `settings` (the six settings pages), `wizard` (the gateway step), or `all` (the default). `SCREENSHOT_OUT` redirects the output to a different repo-relative folder, handy for a dry run that leaves the committed PNGs alone.

The capture lives in `scripts/capture-screenshots.mjs`: the viewport profiles (desktop 1280×800, tablet 1194×834, phone 393×852 and 852×393, all at 2× scale), the routes, and the settings sizing. The dashboard, fullscreen, devices, and Settings → Solar shots replace the live readings with a fixed daytime sample (solar across three named strings, a Smart Port hot water load drawing on the surplus, the battery charging, the grid exporting), so they look the same whether the target is in full sun or sitting dark at night, and the serial and string names are swapped for placeholders. Every context renders in one timezone (`Australia/Sydney`, override with `SCREENSHOT_TZ`) so the footer clock, the cost figure, and the trends x-axis stay consistent between runs. The trends shots keep the real history. The Gateway and Apple Home settings shots are sanitized in-page before they fire, so no real values reach a committed PNG: the gateway host is overwritten with `192.168.1.50`, the HomeKit PIN is masked, and the bind interface is cleared. The wizard shot runs a real Test connection, so the target needs a reachable gateway.

Chromium launches with `--font-render-hinting=none`. Headless Linux Chromium otherwise hints to whole pixels, which snaps glyph advances and spaces the small labels unevenly; disabling it keeps the subpixel positioning a real browser uses, so the captures match the live app.

## Recording the walkthrough video

`scripts/capture-walkthrough.sh` (`npm run walkthrough`) records the screen tour that plays in the README and on the documentation home page. It runs `chrome-headless-shell` from the Playwright Docker image and drives it over the Chrome DevTools Protocol, frame by frame: the page runs on virtual time, and each frame advances the clock by 1/60 s and then renders with `HeadlessExperimental.beginFrame`. Every frame is rendered on schedule, so the video plays at a steady 60 fps however slow the machine is. Real-time recorders only keep the frames Chrome manages to paint, which gives a choppy result. The frames land in `tmp/walkthrough-frames/`, and ffmpeg on the host encodes them (H.264 high profile, `crf 22`, `preset slow`, `yuv420p`, keyframes every 2 s, faststart, no audio) into `walkthrough.mp4` (2560×1600), `walkthrough-1x.mp4` (1280×800), and a `walkthrough.jpg` poster. All three are gitignored. ffmpeg, `gh`, and `jq` have to be on the host alongside Docker.

Point it at an instance carrying live history, the same as the screenshots:

```sh
SIGEN_URL=http://bridge.lan:5163 npm run walkthrough
```

The tour runs at 1280×800 with a mouse. It opens on the dashboard, opens the fullscreen solar metric, then works through the trends chart: Now, Day, the previous day, Week (where it clicks a day's bars to open that day), and the Lanes layout. It then visits the device breakdown, steps through the Theme and Apple Home settings, and returns to the dashboard. The real mouse moves along straight, eased paths, one event per frame, so hover styles and the chart's scrub readout respond as they would for a person. An in-page sprite traced from the macOS arrow and pointing hand draws the cursor, and it shows the hand over anything clickable. The page reveal plays between views. The tour opens and closes on the same dashboard frame: the readings rewind to their first sample before the end, and the footer clock, the battery estimate, and the cost figure are held at their opening values, so the clip loops without a seam.

The readings move on camera. `capture-walkthrough.mjs` precomputes a run of energy-balanced samples (solar ramping up, the battery charging, SoC climbing, grid export growing, home load wobbling, a Smart Port hot water draw holding near 3.6 kW), and a stubbed `EventSource` emits one every 1.4 seconds of virtual time. A read-only server inside the container sits between Chrome and `SIGEN_URL`: it serves the stubbed state, a stubbed unlocked session, the redacted settings, and an empty HomeKit pairing, forwards every other `GET` (the app, the history behind the trends chart), and refuses anything that writes. The settings stub also stages **Show Smart Port on the dashboard**, so the Home tile carries the combined draw and the device breakdown shows the load's card whether or not the target instance has the switch on. The gateway host, HomeKit PIN, advertise address, inverter serial, string names, and outdoor location are swapped for placeholders before they reach the recording, the same redactions the screenshots make.

After encoding, the shell publishes both copies. `scripts/upload-walkthrough.sh` uploads the 2x master to GitHub's user-attachments store and rewrites the README's Demo line to the new URL; GitHub plays a bare user-attachments URL on its own line as an inline video. It uses the same unofficial endpoint as drag-and-drop in the web UI, authenticated with `gh auth token`; if GitHub retires it, drag the mp4 into an issue or PR comment and paste the URL it gives into the README. Each upload gets a new URL, and old uploads can't be listed or deleted. The shell then copies the 1x video and the poster to `docs/public/demo.mp4` and `docs/public/demo-poster.jpg`, and `scripts/upload-docs-media.sh` uploads them to the `media` GitHub release and starts a docs deploy. Commit README.md afterwards to publish the new Demo URL. `WALKTHROUGH_UPLOAD=0` skips both uploads, and `DOCS_MEDIA_DEPLOY=0` uploads the docs media without a deploy. `WALKTHROUGH_FRAMES` and `WALKTHROUGH_FRAME_MS` retune the data sequence, `WALKTHROUGH_TZ` overrides the timezone, and `WALKTHROUGH_CRF` overrides the encode quality.

The documentation site's demo video and poster are not in git. They are assets of the `media` GitHub release, listed in `scripts/docs-media.txt`, and `scripts/fetch-docs-media.sh` downloads them into `docs/public/` before every docs build (`npm run dev` and `npm run build` in `docs/` run it first). The repository has immutable releases switched on, and an immutable release refuses new assets, so `media` was created while the setting was off and stays mutable. Never delete and recreate it with the setting on.

## Generating the social card

`scripts/generate-og.sh` (`npm run og`) renders the Open Graph image that shows up when the documentation link is shared: `docs/public/og.png`, a 1200×630 card on the near-black canvas carrying the white brand mark, the headline (in the brand gradient with **Sigenergy** picked out in white), the tagline, the site URL, and the `dashboard-desktop.png` screenshot in the same tablet frame the home page uses, lit from behind by a radial brand glow. It runs the same Playwright Docker image as the screenshots, with the same `--font-render-hinting=none` flag, but builds a self-contained HTML template inside `generate-og.mjs` with the Inter font, the logo, and the dashboard screenshot inlined as data URIs. It reads the committed screenshot rather than a live instance, so unlike the screenshots and the walkthrough it needs neither a running bridge nor `SIGEN_URL`:

```sh
npm run og
```

`OG_VARIANT` chooses the headline treatment: `a`, the default, sets the headline in the gradient with **Sigenergy** in white; `b` flips that to a white headline with **Sigenergy** in the gradient; and `both` writes `og-a.png` and `og-b.png` next to the output so you can compare them.

```sh
# White headline, Sigenergy in the gradient
OG_VARIANT=b npm run og

# Render both treatments side by side into tmp/
OG_VARIANT=both OG_OUT=tmp/og.png npm run og
```

The per-page tags live in `docs/.vitepress/config.mjs`, where a `transformPageData` hook adds the Open Graph and Twitter Card meta to every page (an absolute image URL, `twitter:card` set to `summary_large_image`, a canonical link, and the page's own title and description), so a shared link renders the card under the right heading. Facebook, LinkedIn, and X cache a URL the first time they scrape it, so after changing the card you have to re-fetch the link through their sharing debuggers, or add a throwaway `?v=2`, before the new image shows.

## The documentation site

This site is built with [VitePress](https://vitepress.dev) and lives in `docs/`. Work on it locally:

```bash
cd docs
npm install
npm run dev      # serves the docs on http://localhost:5173
npm run build    # builds the static site into docs/.vitepress/dist
```

A GitHub Actions workflow (`.github/workflows/docs.yml`) builds and publishes it to GitHub Pages on every push to `main` that touches `docs/`. The brand styling (the near-black canvas, the Inter font with its `cv01` character variant, the amber accent, and the energy-flow hues) is lifted from the web app in `.vitepress/theme/custom.css`.
