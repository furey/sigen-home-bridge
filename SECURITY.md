# Security

## Reporting

Open a private security advisory at https://github.com/furey/sigen-home-bridge/security/advisories/new.

## Scope

Sigen Home Bridge runs on your own network and reads from your Sigenergy gateway over Modbus TCP. A few properties worth knowing before you deploy it:

- **Read-only to the gateway.** The bridge only issues Modbus read-input-register calls (function code 4); it never writes. It cannot change a setting on your inverter, battery, or grid connection, so a compromised bridge still cannot be turned against your hardware.
- **Built for a trusted LAN, with a supported way out.** The dashboard and its live-data API are unauthenticated, on the assumption that the host sits behind your home router. To reach it from outside, don't just port-forward it; front a Cloudflare Tunnel with Cloudflare Access (Zero Trust), which authenticates at Cloudflare's edge and gates the hostname to your own email so the unauthenticated origin is never exposed, no VPN required. That needs a domain on your Cloudflare account, and both Tunnel and Access are free for a personal user. If you run Google Home, its three fulfillment paths (`/fulfillment`, `/auth`, `/token`) are bypassed so Google's servers can still reach them, guarded by the shared Google token; everything else stays behind the login. The settings passcode is a separate, in-app gate on configuration changes.
- **Settings passcode.** A passcode under Settings → Security (a salted scrypt hash, never plaintext) gates configuration changes and the diagnostic and pairing endpoints, and once it's set an unauthenticated `/api/settings` read masks the gateway host, HomeKit PIN, and alert webhook URLs until a valid session token unlocks them. Live readings stay viewable without it.
- **Secrets.** The HomeKit pairing PIN and Google Home auth token live in `.env` and `data/settings.json`; the shipped `.gitignore` keeps both out of version control.

## Dependencies

`npm audit` reports no advisories across the root, `server`, and `ui` workspaces as of the initial public release.
