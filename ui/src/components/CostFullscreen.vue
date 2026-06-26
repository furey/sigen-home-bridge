<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, CircleDollarSign, RefreshCw } from '@lucide/vue'
import { useStateStream } from '../composables/useStateStream.js'
import { useSettings } from '../composables/useSettings.js'
import { useCostReadout } from '../composables/useCostReadout.js'
import { useHoverCapable } from '../composables/useHoverCapable.js'
import { activeRate, formatMoney, minutesOfDay } from '../lib/tariff.js'
import BrandMark from './BrandMark.vue'
import MoneyValue from './MoneyValue.vue'

const { state } = useStateStream()
const { data } = useSettings()
const { amount, mode, currency, daily } = useCostReadout()
const router = useRouter()

const money = (value) => formatMoney({ amount: value, currency: currency.value })

const heading = 'Cost Estimate'
const caption = computed(() => (mode.value === 'perHour' ? 'current per hour' : 'today'))

const lines = computed(() => {
  const cost = daily.value
  if (!cost) return []
  const tariff = data.tariff ?? {}
  const rows = []
  if (cost.supply) rows.push({ label: 'Supply', amount: -cost.supply })
  rows.push({ label: 'Import', amount: -cost.importCost })
  rows.push({ label: 'Export (Feed-in)', amount: cost.feedIn })
  if (tariff.superExportCredit?.enabled) rows.push({ label: 'Super-export', amount: cost.superExportCredit })
  if (tariff.zeroDrawCredit?.enabled) rows.push({ label: 'Zero-draw', amount: cost.zeroDrawCredit })
  return rows
})

const rateHint = computed(() => {
  const tariff = data.tariff
  if (!tariff) return ''
  if (amount.value === null || Math.abs(amount.value) < 0.005) return ''
  const watts = state.gridPower ?? 0
  const minutes = minutesOfDay(new Date())
  const importing = watts > 0
  const rate = importing
    ? activeRate({ windows: tariff.importWindows, defaultRate: tariff.importRate, minutes })
    : activeRate({ windows: tariff.exportWindows, defaultRate: tariff.exportRate, minutes })
  return `${importing ? 'Importing' : 'Exporting'} at ${money(rate)}/kWh`
})

const hoverCapable = useHoverCapable()
const overBack = ref(false)

const back = () => router.push({ name: 'dashboard' })
const reload = () => window.location.reload()

const onKey = (event) => {
  if (event.key === 'Escape') back()
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <main
    class="cost-stage relative flex min-h-app cursor-pointer select-none flex-col items-center justify-center p-safe text-center"
    @click="back"
    @mouseenter="overBack = true"
    @mouseleave="overBack = false"
  >
    <div class="pointer-events-none absolute inset-0 z-10 grid grid-cols-3 items-start p-safe">
      <div
        v-if="hoverCapable"
        class="flex items-center gap-2 justify-self-start text-sm text-zinc-500 transition-opacity duration-200"
        :class="overBack ? 'opacity-100' : 'opacity-0'"
      >
        <ArrowLeft class="w-4 h-4" />Back
      </div>
      <button
        v-else
        class="p-6 pointer-events-auto -m-6 justify-self-start text-zinc-500"
        aria-label="Back to dashboard"
        @click.stop="back"
      >
        <ArrowLeft class="w-6 h-6" />
      </button>

      <button
        class="p-6 pointer-events-auto -m-6 justify-self-center"
        aria-label="Reload app"
        title="Reload app"
        @click.stop="reload"
      >
        <BrandMark class="w-6 h-6 rounded" />
      </button>
    </div>

    <div class="flex flex-col items-center landscape:flex-row landscape:items-center landscape:gap-x-10">
      <div class="flex flex-col items-center">
        <p class="flex items-center gap-2 text-xl text-zinc-400">
          <CircleDollarSign class="w-5 h-5" />{{ heading }}
        </p>
        <p class="text-sm tracking-widest uppercase text-zinc-500">{{ caption }}</p>
        <p class="my-3 leading-none">
          <MoneyValue
            class="text-[calc(var(--mu)*16)] font-semibold tracking-tight"
            :amount="amount"
            :currency="currency"
          />
        </p>
      </div>
      <div v-if="mode === 'perDay'" class="grid gap-x-6 gap-y-1 text-base text-zinc-400 sm:text-lg">
        <span v-for="line in lines" :key="line.label" class="flex justify-between gap-3 tabular-nums">
          <span>{{ line.label }}</span><MoneyValue :amount="line.amount" :currency="currency" />
        </span>
        <span
          v-if="daily"
          class="mt-1 flex justify-between gap-6 border-t border-zinc-700 pt-1 font-semibold tabular-nums text-zinc-300"
        >
          <span>Net</span><MoneyValue :amount="daily.net" :currency="currency" />
        </span>
      </div>
      <p v-else-if="rateHint" class="text-lg text-zinc-400">{{ rateHint }}</p>
    </div>
  </main>
</template>

<style scoped>
.cost-stage {
  --mu: min(1vw, 1.5vh);
}

@media (orientation: portrait) {
  .cost-stage {
    --mu: 1.4vw;
  }
}
</style>
