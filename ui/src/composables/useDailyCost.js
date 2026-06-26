import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useHistory } from './useHistory.js'
import { useSettings } from './useSettings.js'
import { dailyCost } from '../lib/tariff.js'

export const useDailyCost = () => {
  const { samples } = useHistory()
  const { data } = useSettings()
  const now = ref(new Date())

  let ticker = null
  onMounted(() => { ticker = setInterval(() => { now.value = new Date() }, TICK_MS) })
  onUnmounted(() => clearInterval(ticker))

  const cost = computed(() => {
    const tariff = data.tariff
    if (!tariff) return null
    return dailyCost({ samples: samples.value, tariff, now: now.value })
  })

  return { cost }
}

const TICK_MS = 60000
