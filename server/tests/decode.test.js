import { describe, expect, it } from 'vitest'
import { decodePower, decodeSoc, deriveBatteryPower, solarTotal } from '../modbus.js'

const buffer = (...bytes) => ({ buffer: Buffer.from(bytes) })

describe('decodePower', () => {
  it('decodes positive big-endian int32 watts', () => {
    expect(decodePower(buffer(0x00, 0x00, 0x10, 0x68))).toBe(4200)
  })

  it('decodes negative export power', () => {
    expect(decodePower(buffer(0xff, 0xff, 0xff, 0xff))).toBe(-1)
    expect(decodePower(buffer(0xff, 0xff, 0xfc, 0xd8))).toBe(-808)
  })
})

describe('decodeSoc', () => {
  it('scales the raw register by a tenth', () => {
    expect(decodeSoc({ data: [873] })).toBe(87.3)
  })
})

describe('deriveBatteryPower', () => {
  it('discharges (negative) when the home pulls more than solar and grid supply', () => {
    expect(deriveBatteryPower({ pvPower: 0, gridPower: 5, loadPower: 686 })).toBe(-681)
  })

  it('charges (positive) on surplus solar', () => {
    expect(deriveBatteryPower({ pvPower: 5000, gridPower: -1000, loadPower: 700 })).toBe(3300)
  })
})

describe('solarTotal', () => {
  it('sums Sigen DC solar and third-party AC-coupled solar', () => {
    expect(solarTotal({ sigenPvPower: 4000, thirdPartyPvPower: 1200 })).toBe(5200)
  })

  it('treats absent third-party solar as zero', () => {
    expect(solarTotal({ sigenPvPower: 4000 })).toBe(4000)
  })

  it('treats absent Sigen solar as zero', () => {
    expect(solarTotal({ thirdPartyPvPower: 1200 })).toBe(1200)
  })
})
