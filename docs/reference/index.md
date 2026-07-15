---
title: Technical deep dive
description: What the bridge is doing under the hood, and why it works the way it does. Architecture, the register map, the HTTP API, the security model, and more.
---

# Technical deep dive

How the bridge works under the hood, and why it's built the way it is. None of this is needed to run it; reach for it when you want to understand a decision, extend the project, or debug something the [Guide](/guide/) doesn't cover.

## How the bridge fits together

- [Architecture](/reference/architecture): the single-process design, its consumers, and the poller state machine.
- [Configuration](/reference/configuration): the full `.env` reference, settings precedence, and the schedule syntax.
- [Dashboard internals](/reference/dashboard): the estimate maths, the trends chart, and the palette rules.

## Talking to the gateway

- [Register map](/reference/register-map): every register the poller reads, with types and units.
- [Devices & sources](/reference/devices): how it discovers multiple inverters, solar strings, and Smart Port loads, and what it doesn't read yet.
- [Control registers](/reference/control-registers): the writable surface the bridge deliberately leaves alone, and why.

## Interfaces

- [HTTP API](/reference/http-api): every endpoint, the snapshot schema, and the history queries.
- [Apple Home mapping](/reference/apple-home): why power becomes a temperature sensor.
- [Google Home fulfillment](/reference/google-home): the intents, the trait mapping, and the stub OAuth.
- [Cloudflare Tunnel & Access](/reference/cloudflare): publishing the bridge over HTTPS, gated at the edge.

## Subsystems

- [Energy tariffs](/reference/tariffs): the cost engine and what it can't model.
- [Alerts engine](/reference/alerts): the trigger catalogue, the edge state machine, and its delivery channels.
- [Security model](/reference/security): exactly what's open, what the passcode locks, and the recovery path.

## Working on it

- [Local development](/reference/development): running it locally, the scripts, verifying the gateway, and how the README screenshots and walkthrough are captured.

::: info Also on GitHub
This deep dive mirrors [`docs/DEEP_DIVE.md`](https://github.com/furey/sigen-home-bridge/blob/main/docs/DEEP_DIVE.md) in the repository, reorganised for the web.
:::
