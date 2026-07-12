import { describe, expect, it } from 'vitest'
import { discoverInverters, readInverter, readSmartLoads } from '../devices.js'

const u16 = (value) => {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16BE(value)
  return buffer
}

const s16 = (value) => {
  const buffer = Buffer.alloc(2)
  buffer.writeInt16BE(value)
  return buffer
}

const s32 = (value) => {
  const buffer = Buffer.alloc(4)
  buffer.writeInt32BE(value)
  return buffer
}

const text = (value, words) => {
  const buffer = Buffer.alloc(words * 2)
  buffer.write(value, 'ascii')
  return buffer
}

const stringBlock = (pairs) => {
  const buffer = Buffer.alloc(pairs.length * 4)
  pairs.forEach(([voltage, current], slot) => {
    buffer.writeInt16BE(voltage, slot * 4)
    buffer.writeInt16BE(current, slot * 4 + 2)
  })
  return buffer
}

const fakeClient = (responder) => {
  let unitId = 0
  return {
    setID(id) {
      unitId = id
    },
    setTimeout() {},
    async readInputRegisters(address, length) {
      const buffer = responder(unitId, address, length)
      if (!buffer) throw new Error('Modbus exception 2: Illegal data address')
      return { buffer }
    }
  }
}

const liveResponder = (runningState) => (unitId, address) => {
  if (unitId !== 1) return null
  const table = {
    30578: u16(runningState),
    30587: s32(6508),
    31003: s16(496),
    30601: u16(915),
    30602: u16(1000),
    31027: stringBlock([[3000, 200], [2900, 200], [0, 0]])
  }
  return table[address]
}

const device = { unitId: 1, model: 'SigenStor EC 15.0 TP AU', serial: 'CMU110A24130243', stringCount: 3 }

describe('readInverter', () => {
  it('assembles live readings with scaled values and per-string power', async () => {
    const inverter = await readInverter(fakeClient(liveResponder(1)), device)
    expect(inverter.status).toBe('running')
    expect(inverter.activePower).toBe(6508)
    expect(inverter.temperature).toBe(49.6)
    expect(inverter.soc).toBe(91.5)
    expect(inverter.soh).toBe(100)
    expect(inverter.strings).toEqual([
      { index: 1, voltage: 300, current: 2, power: 600 },
      { index: 2, voltage: 290, current: 2, power: 580 },
      { index: 3, voltage: 0, current: 0, power: 0 }
    ])
    expect(inverter.solarPower).toBe(1180)
  })

  it('labels an unrecognised running state as unknown', async () => {
    const inverter = await readInverter(fakeClient(liveResponder(9)), device)
    expect(inverter.status).toBe('unknown')
  })
})

const smartLoadBlocks = (loads) => {
  const energy = Buffer.alloc(24 * 4)
  const power = Buffer.alloc(24 * 4)
  loads.forEach(({ slot, watts, hundredthsKwh }) => {
    power.writeInt32BE(watts, slot * 4)
    energy.writeUInt32BE(hundredthsKwh, slot * 4)
  })
  return (unitId, address) => (address === 30098 ? energy : address === 30146 ? power : null)
}

describe('readSmartLoads', () => {
  it('returns only slots with lifetime energy or live power', async () => {
    const responder = smartLoadBlocks([
      { slot: 0, watts: 4484, hundredthsKwh: 95475 },
      { slot: 2, watts: 0, hundredthsKwh: 1200 },
      { slot: 5, watts: -300, hundredthsKwh: 0 }
    ])
    const loads = await readSmartLoads(fakeClient(responder))
    expect(loads).toEqual([
      { type: 'smartLoad', index: 1, power: 4484, lifetimeEnergy: 954.75 },
      { type: 'smartLoad', index: 3, power: 0, lifetimeEnergy: 12 },
      { type: 'smartLoad', index: 6, power: -300, lifetimeEnergy: 0 }
    ])
  })

  it('returns an empty list when every slot is zero', async () => {
    const loads = await readSmartLoads(fakeClient(smartLoadBlocks([])))
    expect(loads).toEqual([])
  })

  it('throws when the registers are unsupported', async () => {
    await expect(readSmartLoads(fakeClient(() => null))).rejects.toThrow('Modbus exception')
  })
})

describe('discoverInverters', () => {
  const identityResponder = (unitId, address) => {
    if (unitId !== 1) return null
    const table = {
      30500: text('SigenStor EC 15.0 TP AU', 15),
      30515: text('CMU110A24130243', 10),
      31025: u16(7)
    }
    return table[address]
  }

  it('finds responding inverters and clamps the string count', async () => {
    const found = await discoverInverters(fakeClient(identityResponder), { sweepMax: 3, timeoutMs: 1 })
    expect(found).toEqual([
      { unitId: 1, model: 'SigenStor EC 15.0 TP AU', serial: 'CMU110A24130243', stringCount: 4 }
    ])
  })

  it('returns nothing when no unit answers', async () => {
    const found = await discoverInverters(fakeClient(() => null), { sweepMax: 3, timeoutMs: 1 })
    expect(found).toEqual([])
  })
})
