export const costPerHour = ({ gridWatts, importRate, exportRate }) => {
  if (Math.abs(gridWatts) < GRID_DEADBAND_WATTS) return 0
  const rate = gridWatts >= 0 ? importRate : exportRate
  return (gridWatts / 1000) * rate
}

export const activeRate = ({ windows, defaultRate, minutes }) => {
  const hit = (windows ?? []).find((window) => withinWindow(window, minutes))
  return hit ? hit.rate : defaultRate
}

export const dailyCost = ({ samples, tariff, now }) => {
  const dayStart = startOfDay(now).getTime()
  const today = (samples ?? []).filter((sample) => Number.isFinite(sample?.t) && sample.t >= dayStart)
  const tally = accumulate(today, tariff)
  const superExportCredit = tariff.superExportCredit.enabled
    ? Math.min(tally.superExportKwh, tariff.superExportCredit.capKwh) * tariff.superExportCredit.rate
    : 0
  const zeroDrawMet = tally.zeroDrawImportKwh <= ZERO_DRAW_TOLERANCE_KWH
  const zeroDrawCredit = tariff.zeroDrawCredit.enabled && zeroDrawMet ? tariff.zeroDrawCredit.perDay : 0
  const supply = tariff.supplyChargePerDay
  const net = tally.feedIn + superExportCredit + zeroDrawCredit - tally.importCost - supply
  return {
    importCost: tally.importCost,
    feedIn: tally.feedIn,
    superExportCredit,
    zeroDrawCredit,
    zeroDrawMet,
    supply,
    net,
    currency: tariff.currency
  }
}

export const formatMoney = ({ amount, currency }) => {
  const safe = Math.abs(amount) < MONEY_DEADBAND ? 0 : amount
  try {
    return currencyFormatter(currency).format(safe)
  } catch {
    return safe.toFixed(2)
  }
}

export const moneyParts = ({ amount, currency }) => {
  if (amount === null || amount === undefined) return null
  const safe = Math.abs(amount) < MONEY_DEADBAND ? 0 : amount
  const kind = safe === 0 ? 'idle' : safe < 0 ? 'debit' : 'credit'
  const display = kind === 'credit' ? -Math.abs(safe) : Math.abs(safe)
  return { kind, parts: moneySegments({ amount: display, currency }) }
}

export const minutesOfDay = (date) => date.getHours() * 60 + date.getMinutes()

const accumulate = (samples, tariff) => {
  const tally = { importCost: 0, feedIn: 0, superExportKwh: 0, zeroDrawImportKwh: 0 }
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1]
    const current = samples[index]
    const elapsedMs = current.t - previous.t
    if (elapsedMs <= 0 || elapsedMs > MAX_GAP_MS) continue
    const hours = elapsedMs / MS_PER_HOUR
    const watts = (previous.gridPower + current.gridPower) / 2
    if (Math.abs(watts) < GRID_DEADBAND_WATTS) continue
    const minutes = minutesOfDay(new Date(previous.t + elapsedMs / 2))
    if (watts >= 0) {
      const kwh = (watts / 1000) * hours
      tally.importCost +=
        kwh * activeRate({ windows: tariff.importWindows, defaultRate: tariff.importRate, minutes })
      if (withinWindow(tariff.zeroDrawCredit, minutes)) tally.zeroDrawImportKwh += kwh
    } else {
      const kwh = (-watts / 1000) * hours
      tally.feedIn +=
        kwh * activeRate({ windows: tariff.exportWindows, defaultRate: tariff.exportRate, minutes })
      if (withinWindow(tariff.superExportCredit, minutes)) tally.superExportKwh += kwh
    }
  }
  return tally
}

const withinWindow = ({ start, end }, minutes) => {
  const from = clockToMinutes(start)
  const to = clockToMinutes(end)
  if (from === to) return false
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to
}

const startOfDay = (date) => {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  return start
}

const clockToMinutes = (clock) => {
  const [hours, minutes] = clock.split(':').map(Number)
  return hours * 60 + minutes
}

const moneySegments = ({ amount, currency }) => {
  try {
    return currencyFormatter(currency)
      .formatToParts(amount)
      .map((part) => ({ text: part.value, role: SYMBOL_PARTS.has(part.type) ? 'symbol' : 'value' }))
  } catch {
    return [{ text: amount.toFixed(2), role: 'value' }]
  }
}

const currencyFormatter = (currency) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })

const SYMBOL_PARTS = new Set(['currency', 'plusSign', 'minusSign', 'literal'])

const MONEY_DEADBAND = 0.005

const MS_PER_HOUR = 3600000

const MAX_GAP_MS = 900000

const GRID_DEADBAND_WATTS = 50

const ZERO_DRAW_TOLERANCE_KWH = 0.05
