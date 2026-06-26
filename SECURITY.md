# Security

## Reporting

Open a private security advisory at https://github.com/furey/sigen-home-bridge/security/advisories/new.

## Scope

Sigen Home Bridge runs on your own network and reads from your Sigenergy gateway over Modbus TCP. A few properties worth knowing before you deploy it:

- **Read-only to the gateway.** The bridge only issues Modbus read-input-register calls (function code 4); it never writes. It cannot change a setting on your inverter, battery, or grid connection, so a compromised bridge still cannot be turned against your hardware.
- **Built for a trusted LAN.** The dashboard and its live-data API are unauthenticated, on the assumption that the host sits behind your home router. If you expose it past your LAN (reverse proxy, VPN, or tunnel), enable the settings passcode and put your own authentication in front of it.
- **Settings passcode.** Settings changes can be gated behind a passcode under Settings → Security, stored as a salted scrypt hash rather than plaintext. Live readings stay viewable without it.
- **Secrets.** The HomeKit pairing PIN and Google Home auth token live in `.env` and `data/settings.json`; the shipped `.gitignore` keeps both out of version control.

## Dependencies

`npm audit` reports no advisories across the root, `server`, and `ui` workspaces as of the initial public release.
