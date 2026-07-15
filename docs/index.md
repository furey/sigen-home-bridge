---
layout: home

hero:
  name: sigen-home-bridge
  text: Your Sigenergy data, live and local.
  tagline: >-
    A self-hosted bridge that reads your solar and battery straight off your home
    network, then shows it on a web dashboard, in Apple Home, and in Google Home.
    No cloud account. No Home Assistant.
  image:
    src: /logo.svg
    alt: sigen-home-bridge
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: What it is
      link: /guide/
    - theme: alt
      text: Technical deep dive
      link: /reference/

features:
  - icon:
      light: /icons/layout-dashboard-light.svg
      dark: /icons/layout-dashboard-dark.svg
    title: Live dashboard
    details: Solar, battery, grid, and home usage on one screen, updating as the bridge reads your system. Resizes for a wall tablet or a spare phone, and installs as a home-screen app.
    link: /guide/dashboard
    linkText: See the dashboard
  - icon:
      light: /icons/house-light.svg
      dark: /icons/house-dark.svg
    title: Apple Home
    details: Your readings on iPhone, iPad, and HomePod, paired with a QR code. Usable in automations, all on your LAN with no cloud.
    link: /guide/apple-home
    linkText: Set up Apple Home
  - icon:
      light: /icons/cloud-light.svg
      dark: /icons/cloud-dark.svg
    title: Google Home
    details: Battery and power readings in the Google Home app, reached through a free Cloudflare Tunnel.
    link: /guide/google-home
    linkText: Set up Google Home
  - icon:
      light: /icons/chart-spline-light.svg
      dark: /icons/chart-spline-dark.svg
    title: Trends & history
    details: Every reading on one chart with a day/night sky backdrop. Scrub back through your history, then export it as CSV or JSON.
    link: /guide/dashboard#trends
    linkText: About trends
  - icon:
      light: /icons/bell-ring-light.svg
      dark: /icons/bell-ring-dark.svg
    title: Alerts & webhooks
    details: Get pinged when the battery runs low, the gateway drops, or you start importing. Routed to Apple Home, a webhook (ntfy, Pushover, Discord), or both.
    link: /guide/alerts
    linkText: Build an alert
  - icon:
      light: /icons/shield-check-light.svg
      dark: /icons/shield-check-dark.svg
    title: Read-only by design
    details: The bridge never writes to your Sigenergy system, so it can't change a thing. Worst case is someone on your network sees your numbers.
    link: /reference/security
    linkText: The security model
---
