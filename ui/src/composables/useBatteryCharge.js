import { computed } from 'vue'
import { useSettings } from './useSettings.js'
import { useStateStream } from './useStateStream.js'

export const useBatteryCharge = () => {
  const { data } = useSettings()
  const { state } = useStateStream()
  return computed(() => chargeReadout({
    soc: state.batterySoc ?? 0,
    capacityKwh: data.battery.capacityKwh ?? state.ratedEnergyCapacity,
    unit: data.battery.chargeUnit
  }))
}

const chargeReadout = ({ soc, capacityKwh, unit }) => {
  if (unit !== 'energy' || !capacityKwh) {
    return { value: `${socPercent(soc)}`, unit: '%', isPercent: true }
  }
  return { value: chargeEnergy({ soc, capacityKwh }), unit: 'kWh', isPercent: false }
}

const chargeEnergy = ({ soc, capacityKwh }) => {
  if (soc <= 0) return (0).toFixed(1)
  if (soc >= 100) return capacityKwh.toFixed(1)
  const fullTenths = Math.round(capacityKwh * 10)
  const tenths = Math.round(soc / 100 * capacityKwh * 10)
  return (Math.min(fullTenths - 1, Math.max(1, tenths)) / 10).toFixed(1)
}

const socPercent = (soc) => {
  const value = Number(soc) || 0
  if (value <= 0) return 0
  if (value >= 100) return 100
  return Math.min(99, Math.max(1, Math.round(value)))
}
