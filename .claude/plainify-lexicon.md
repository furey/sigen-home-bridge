# Plainify lexicon — sigen-home-bridge

Jargon-to-plain decisions for this project. Read before a run, extend after.
The docs site is split: `guide/` pages are `docs` preset for a new user (a
homeowner who can run Docker but isn't a Modbus engineer); `reference/` pages
are `reference` preset for a practitioner and keep the jargon.

| Term | Plain form | Policy | Reader / preset | Note |
| --- | --- | --- | --- | --- |
| Modbus TCP | reads over your home network | gloss | user / guide | keep the exact term in reference |
| gateway | your Sigenergy gateway | keep | user / guide | gloss once as "the box that runs your system" |
| poll / polling | check your system | gloss | user / guide | keep "poll" in reference |
| poll cadence / interval | how often it checks | strip | user / guide | |
| register / register map | reading | strip | user / guide | reference keeps register addresses |
| SoC / state of charge | battery charge | gloss | user / guide | show % |
| SoH / state of health | battery health | gloss | user / guide | |
| PV | solar | strip | user / guide | keep PV in reference and API fields |
| SSE / Server-Sent Events | a live stream | strip | user / guide | keep in reference |
| Bonjour / mDNS | Apple's local discovery | gloss | user / guide | keep terms in reference |
| fulfillment endpoint | the web address Google calls | gloss | user / guide | keep `/fulfillment` path |
| tunnel / Cloudflare Tunnel | a secure public link | gloss | user / guide | keep product name on first use |
| Cloudflare Access | a login wall at Cloudflare's edge | gloss | user / guide | |
| retention window | how far back the history goes | gloss | user / guide | |
| Smart Port | Smart Port | keep | user / guide | Sigenergy's name; gloss as the gateway's controlled-load port |
| webhook | a web address you nominate | gloss | user / guide | keep "webhook" after glossing |
| deadband / hysteresis | — | keep | practitioner / reference | reference only, never in guide |
| schema (version) | version stamp | gloss | user / guide | keep `schema` JSON key |
| sidecar | a second small container | gloss | user / guide | |
| kiosk | wall display | strip | user / guide | keep "kiosk" in reference |
| reverse proxy | reverse proxy | keep | user / guide | remote-access page reader is already networking-literate |

## Voice notes
- Guide pages: short sentences, Australian, explain why a step matters, not just what to do. Lead with what the reader gets.
- Reference pages: precise, do not dumb down; keep register addresses, units, sign conventions, endpoint paths, and code exactly.
- Never invite "open an issue/PR" (furey repos use Discussions only). Never put the author's real gateway IP/MAC/serial in shared docs; use placeholders like `192.168.1.50`.
