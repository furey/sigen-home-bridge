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
    return { value: `${Math.round(soc)}`, unit: '%', isPercent: true }
  }
  return { value: (soc / 100 * capacityKwh).toFixed(1), unit: 'kWh', isPercent: false }
}
