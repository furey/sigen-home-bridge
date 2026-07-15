---
title: Register map
description: Every input register the poller reads, with addresses, word counts, types, scaling, and the derived battery-power calculation.
---

# Register map

All values are input registers (function code `0x04`), read at their raw addresses (no `30001` offset). Power registers are signed 32-bit big-endian in watts; SOC and SOH are 16-bit values scaled by ten; energy counters are unsigned big-endian integers scaled by 100 to kWh.

| Signal                     | Register | Words | Type        | Meaning                                       |
| -------------------------- | -------- | ----- | ----------- | --------------------------------------------- |
| `gridPower`                | 30005    | 2     | int32 W     | Grid power (positive import, negative export) |
| `batterySoc`               | 30014    | 1     | uint16 ÷10  | Battery state of charge, percent              |
| `sigenPvPower`             | 30035    | 2     | int32 W     | Sigenergy DC solar production                 |
| `ratedEnergyCapacity`      | 30083    | 2     | uint32 ÷100 | Installed battery capacity, kWh               |
| `batterySoh`               | 30087    | 1     | uint16 ÷10  | Battery state of health, percent              |
| `lifetimePv`               | 30088    | 4     | uint64 ÷100 | Cumulative PV generation, kWh                 |
| `consumedToday`            | 30092    | 2     | uint32 ÷100 | Home consumption since midnight, kWh          |
| `lifetimeConsumed`         | 30094    | 4     | uint64 ÷100 | Cumulative home consumption, kWh              |
| smart-load energy block    | 30098    | 48    | uint32 ÷100 | Lifetime energy per Smart Port load, 24 slots of 2 words, kWh |
| smart-load power block     | 30146    | 48    | int32 W     | Live power per Smart Port load, 24 slots of 2 words |
| `thirdPartyPvPower`        | 30194    | 2     | int32 W     | Third-party (AC-coupled) solar, 0 without one |
| `lifetimeBatteryCharge`    | 30200    | 4     | uint64 ÷100 | Cumulative battery charge, kWh                |
| `lifetimeBatteryDischarge` | 30204    | 4     | uint64 ÷100 | Cumulative battery discharge, kWh             |
| `lifetimeGridImport`       | 30216    | 4     | uint64 ÷100 | Cumulative grid import, kWh                   |
| `lifetimeGridExport`       | 30220    | 4     | uint64 ÷100 | Cumulative grid export, kWh                   |
| `generalLoadPower`         | 30282    | 2     | int32 W     | House load excluding EV chargers/smart loads  |
| `loadPower`                | 30284    | 2     | int32 W     | Home consumption (total, includes EV)         |

Solar is the sum of two registers, not one. `pvPower` (what the dashboard and HomeKit show) is `sigenPvPower` (30035, the Sigenergy DC arrays) plus `thirdPartyPvPower` (30194, an AC-coupled third-party inverter the gateway meters via a CT sensor). On a system with no third-party PV the second register reads 0, so `pvPower` equals `sigenPvPower`. `generalLoadPower` (30282) is the house load with the EV chargers and trackable smart loads removed, alongside the total at 30284.

## Battery power is derived

Battery power is derived, not read. Register 30037 ("ESS power") is the gross battery output, which includes the system's own draw (BMS, cooling, controller, gateway) and so reads higher than the mySigen app's battery figure (by ~0.2–0.3 kW at idle). Instead `batteryPower` is computed as `pvPower + gridPower − loadPower` (positive charging, negative discharging), which matches the app and keeps solar, battery, grid, and home in balance; folding third-party PV into `pvPower` keeps that balance right on AC-coupled systems too. `npm run probe` still prints raw register 30037 as `essPower` alongside the derived value for comparison.

## Firmware differences

If a register returns a Modbus exception (illegal data address, common on older firmware), the poller logs it once and skips that register for the rest of the session; the corresponding state field stays `null`. The four core power and SoC registers are present on every known firmware version. The others were verified against a specific installation; `npm run probe` is the quickest way to confirm what yours supports before relying on them (see [Local development](/reference/development#verifying-the-gateway)).

`ratedEnergyCapacity` feeds the battery time-to-empty estimate as an automatic fallback when the capacity field in Settings → Battery is blank, so the kWh line in the estimate appears without any manual configuration on firmware that reports this register.

::: tip Beyond the plant totals
These registers are the plant-level aggregates read on unit 247. For the per-inverter, per-string, and Smart Port reads, see [Devices & sources](/reference/devices). For the writable holding registers the bridge never touches, see [Control registers](/reference/control-registers).
:::
