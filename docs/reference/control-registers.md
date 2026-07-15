---
title: Control registers
description: The writable holding-register surface the bridge deliberately never touches, catalogued so the read-only boundary is explicit, and why it stays that way.
---

# Control registers

The bridge only ever issues function code `0x04` (read input registers); it never writes. The gateway also exposes a writable control surface over holding registers (`0x03` to read, `0x06`/`0x10` to write) that this project deliberately leaves untouched. It's catalogued here so the boundary is explicit, and so a future fork knows what's involved before crossing it.

Writing anything takes two steps: set **Remote EMS enable** (40029) to 1, then choose a **control mode** (40031). Until remote EMS is enabled the setpoints are ignored; once it is, the read-only EMS work mode (30003) reads back as remote mode. These whole-plant registers live on the plant unit (247).

| Register                         | Address       | Type       | Notes                                |
| -------------------------------- | ------------- | ---------- | ------------------------------------ |
| Plant start / stop               | 40000         | uint16     | 0 stop, 1 start                      |
| Active power target              | 40001         | int32 W    | positive exports / discharges        |
| Reactive power target            | 40003         | int32 var  |                                      |
| Active power target, percent     | 40005         | int16 ÷100 | −100 to 100                          |
| **Remote EMS enable**            | **40029**     | uint16     | 0 off, 1 on; set before any setpoint |
| **Remote EMS control mode**      | **40031**     | uint16     | see the enum below                   |
| ESS max charge / discharge limit | 40032 / 40034 | uint32 W   |                                      |
| PV max power limit               | 40036         | uint32 W   |                                      |
| Grid export / import limit       | 40038 / 40040 | uint32 W   | cap at the point of common coupling  |
| Backup (reserve) SoC             | 40046         | uint16 ÷10 | UPS reserve floor, percent           |
| Charge / discharge cut-off SoC   | 40047 / 40048 | uint16 ÷10 | percent                              |

Control mode (40031): 0 PCS remote control, 1 standby, 2 maximum self-consumption (default), 3 command charge (grid first), 4 command charge (PV first), 5 command discharge (PV first), 6 command discharge (battery first), 8 V2G. So forcing a grid charge is 40029 = 1, 40031 = 3, then a charge power via 40032 or 40001; self-consumption is mode 2; idle is mode 1.

Inverter and charger control follow the same pattern on their own unit IDs: inverter on/off at 40500, the DC charger at 41000 (0 = start, 1 = stop, inverted from every other on/off register here), and the AC charger start/stop at 42000 with its output current setpoint at 42001.

These addresses come from two cross-checked open-source implementations of the V2.7 protocol rather than the vendor PDF (which ships as a scanned image), and registers added in a newer firmware return an illegal-data-address exception on older units, so anything built on them should be verified against the hardware with `npm run probe` first.

## Why it stays read-only

The settings API has no authentication (see the [Security model](/reference/security)): anyone who can reach the bridge can already change its config. If the bridge could also write control registers, that same reach would extend to commanding the battery, the grid import and export limits, and the on/off-grid state of the house. Sticking to input registers caps the worst case at reading values rather than steering the home's energy system, which is why HomeKit and Google get sensors and not switches. Adding control would mean putting real authentication in front of the API first and treating it as a separate, opt-in capability.
