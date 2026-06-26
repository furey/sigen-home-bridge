import { computed } from 'vue'
import { useStateStream } from './useStateStream.js'
import { useSettings } from './useSettings.js'
import { useDailyCost } from './useDailyCost.js'
import { activeRate, costPerHour, minutesOfDay } from '../lib/tariff.js'

export const useCostReadout = () => {
  const { state } = useStateStream()
  const { data } = useSettings()
  const { cost } = useDailyCost()

  const amount = computed(() => {
    const tariff = data.tariff
    if (!tariff) return null
    if (tariff.costMode === 'perHour') return perHourCost(state, tariff)
    return cost.value ? cost.value.net : null
  })

  const currency = computed(() => data.tariff?.currency ?? 'USD')
  const mode = computed(() => data.tariff?.costMode ?? 'perDay')
  const estimateLabel = computed(() =>
    mode.value === 'perHour' ? 'Hourly Cost Estimate' : "Today's Cost Estimate")

  return { amount, currency, mode, estimateLabel, daily: cost }
}

const perHourCost = (state, tariff) => {
  const minutes = minutesOfDay(new Date())
  const perHour = costPerHour({
    gridWatts: state.gridPower ?? 0,
    importRate: activeRate({ windows: tariff.importWindows, defaultRate: tariff.importRate, minutes }),
    exportRate: activeRate({ windows: tariff.exportWindows, defaultRate: tariff.exportRate, minutes })
  })
  return -perHour
}
