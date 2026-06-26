export const skyGradientStops = ({ start, end, latitude, longitude, count = 64 }) =>
  Array.from({ length: count + 1 }, (_, index) => {
    const fraction = index / count
    const altitude = sunAltitude({ t: start + fraction * (end - start), latitude, longitude })
    return { offset: fraction, ...tintFor(altitude) }
  })

export const sunCrossings = ({ start, end, latitude, longitude, count = 96 }) => {
  const crossings = []
  const step = (end - start) / count
  let wasBelow = belowHorizon({ t: start, latitude, longitude })
  for (let index = 1; index <= count; index++) {
    const t = start + index * step
    const isBelow = belowHorizon({ t, latitude, longitude })
    if (isBelow !== wasBelow) crossings.push({
      t: refineCrossing({ low: t - step, high: t, latitude, longitude, wasBelow }),
      type: wasBelow ? 'sunrise' : 'sunset'
    })
    wasBelow = isBelow
  }
  return crossings
}

export const sunAltitude = ({ t, latitude, longitude }) => {
  const days = t / DAY_MS - DAYS_TO_J2000
  const meanAnomaly = RAD * (357.5291 + 0.98560028 * days)
  const equationOfCenter = RAD * (1.9148 * Math.sin(meanAnomaly)
    + 0.02 * Math.sin(2 * meanAnomaly)
    + 0.0003 * Math.sin(3 * meanAnomaly))
  const eclipticLongitude = meanAnomaly + equationOfCenter + RAD * PERIHELION_LONGITUDE + Math.PI
  const declination = Math.asin(Math.sin(eclipticLongitude) * Math.sin(OBLIQUITY))
  const rightAscension = Math.atan2(
    Math.sin(eclipticLongitude) * Math.cos(OBLIQUITY),
    Math.cos(eclipticLongitude)
  )
  const siderealTime = RAD * (280.16 + 360.9856235 * days + longitude)
  const hourAngle = siderealTime - rightAscension
  const observerLatitude = RAD * latitude
  return Math.asin(Math.sin(observerLatitude) * Math.sin(declination)
    + Math.cos(observerLatitude) * Math.cos(declination) * Math.cos(hourAngle)) / RAD
}

const refineCrossing = ({ low, high, latitude, longitude, wasBelow }) => {
  for (let iteration = 0; iteration < 20; iteration++) {
    const mid = (low + high) / 2
    if (belowHorizon({ t: mid, latitude, longitude }) === wasBelow) low = mid
    else high = mid
  }
  return Math.round((low + high) / 2)
}

const belowHorizon = ({ t, latitude, longitude }) =>
  sunAltitude({ t, latitude, longitude }) < HORIZON_ALTITUDE

const tintFor = (altitude) => {
  const frames = TINT_FRAMES
  if (altitude <= frames[0].altitude) return tintOf(frames[0])
  if (altitude >= frames.at(-1).altitude) return tintOf(frames.at(-1))
  const upper = frames.findIndex((frame) => frame.altitude > altitude)
  const from = frames[upper - 1]
  const to = frames[upper]
  const blend = (altitude - from.altitude) / (to.altitude - from.altitude)
  return {
    color: `rgb(${from.color.map((channel, index) =>
      Math.round(channel + (to.color[index] - channel) * blend)).join(', ')})`,
    opacity: from.opacity + (to.opacity - from.opacity) * blend
  }
}

const tintOf = ({ color, opacity }) => ({ color: `rgb(${color.join(', ')})`, opacity })

const TINT_FRAMES = [
  { altitude: -18, color: [49, 46, 129], opacity: 0.05 },
  { altitude: -6, color: [99, 102, 241], opacity: 0.08 },
  { altitude: 0, color: [251, 146, 60], opacity: 0.16 },
  { altitude: 8, color: [251, 191, 36], opacity: 0.13 },
  { altitude: 30, color: [252, 211, 77], opacity: 0.1 }
]

const HORIZON_ALTITUDE = -0.833

const RAD = Math.PI / 180

const OBLIQUITY = RAD * 23.4397

const PERIHELION_LONGITUDE = 102.9372

const DAY_MS = 86400000

const DAYS_TO_J2000 = 10957.5
