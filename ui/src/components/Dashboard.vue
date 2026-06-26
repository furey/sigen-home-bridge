<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChartSpline, Cpu, Settings, Thermometer } from '@lucide/vue'
import { useStateStream } from '../composables/useStateStream.js'
import { useBatteryEstimate } from '../composables/useBatteryEstimate.js'
import { useDashboardView } from '../composables/useDashboardView.js'
import { useSettings } from '../composables/useSettings.js'
import { useHoverCapable } from '../composables/useHoverCapable.js'
import { useScrub } from '../composables/useScrub.js'
import { accentFor, directionFor, flowAccentFor, flowIconFor, iconFor, metricByKey } from '../lib/metrics.js'
import { useCostReadout } from '../composables/useCostReadout.js'
import BrandMark from './BrandMark.vue'
import MoneyValue from './MoneyValue.vue'
import TrendsView from './TrendsView.vue'

const TIME_FORMAT = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }

const { state, connected } = useStateStream()
const { view } = useDashboardView()
const { data: settings } = useSettings()
const router = useRouter()
const route = useRoute()

const trendsActive = computed(() => route.name === 'trends')
const toggleTrends = () => {
  view.trends = !trendsActive.value
  router.push({ name: trendsActive.value ? 'dashboard' : 'trends' })
}

const solar = metricByKey('pvPower')
const grid = metricByKey('gridPower')
const home = metricByKey('loadPower')
const soc = metricByKey('batterySoc')
const power = metricByKey('batteryPower')

const quadrants = [
  { key: 'battery' },
  { key: 'loadPower', metric: home },
  { key: 'pvPower', metric: solar },
  { key: 'gridPower', metric: grid }
]

const hoverCapable = useHoverCapable()
const hoveredHalf = ref(null)
const setHalf = (half) => { hoveredHalf.value = hoverCapable.value ? half : null }
const dimmed = (half) => {
  if (!hoveredHalf.value) return false
  const [tile, side] = hoveredHalf.value.split('-')
  const [thisTile, thisSide] = half.split('-')
  return tile === thisTile && side !== thisSide
}

const open = (metric) => router.push({ name: 'metric', params: { slug: metric.slug } })
const openSettings = () => router.push({ name: 'settings' })
const openDevices = () => router.push({ name: 'devices' })
const showDevicesButton = computed(() => {
  const mode = settings.appearance.devicesButton ?? 'auto'
  if (mode === 'show') return true
  if (mode === 'hide') return false
  return state.devices.length > 1
})
const reload = () => window.location.reload()

const valueOf = (metric) => metric.format(state[metric.key] ?? 0)
const colorOf = (metric) => accentFor(metric, state[metric.key] ?? 0)
const labelOf = (metric) => directionFor(metric, state[metric.key] ?? 0)
const flowIconOf = (metric) => flowIconFor(metric, state[metric.key] ?? 0)
const flowColorOf = (metric) => flowAccentFor(metric, state[metric.key] ?? 0)

const socValue = computed(() => Math.round(state.batterySoc ?? 0))
const socColor = computed(() => accentFor(soc, state.batterySoc ?? 0))
const socWidth = computed(() => `${Math.max(0, Math.min(100, state.batterySoc ?? 0))}%`)
const socIcon = computed(() => iconFor(soc, state))
const powerValue = computed(() => power.format(state.batteryPower ?? 0))
const powerColor = computed(() => accentFor(power, state.batteryPower ?? 0))
const batteryDirection = computed(() => directionFor(power, state.batteryPower ?? 0))
const powerFlowIcon = computed(() => flowIconFor(power, state.batteryPower ?? 0))
const powerFlowColor = computed(() => flowAccentFor(power, state.batteryPower ?? 0))
const batteryEstimate = useBatteryEstimate()
const estimateReady = computed(() => batteryEstimate.value.status === 'ready')
const estimateCharging = computed(() => batteryEstimate.value.charging === true)
const estimateText = computed(() => {
  if (estimateReady.value) return batteryEstimate.value.text
  return batteryEstimate.value.status === 'warming' ? 'Estimating…' : ''
})
const estimateVisible = computed(() => connected.value)

const scrubSample = useScrub()
const tempUnit = computed(() => (settings.weather.units === 'fahrenheit' ? 'F' : 'C'))
const temperature = computed(() => {
  if (scrubSample.value && state.outdoorTemp != null) {
    const scrubbed = scrubSample.value.outdoorTemp
    return scrubbed == null ? '—' : `${Math.round(scrubbed)}°${tempUnit.value}`
  }
  return state.outdoorTemp == null ? null : `${Math.round(state.outdoorTemp)}°${tempUnit.value}`
})
const locationName = computed(() => state.outdoorLocation || null)

const { amount: costAmount, currency: costCurrency, estimateLabel: costLabel } = useCostReadout()
const showCostTile = computed(() => Boolean(settings.tariff?.showOnDashboard))
const openCost = () => router.push({ name: 'cost' })

const lastUpdated = computed(() =>
  state.lastUpdated
    ? new Date(state.lastUpdated).toLocaleTimeString([], TIME_FORMAT)
    : '—')
</script>

<template>
  <main class="flex flex-col gap-4 min-h-app p-safe">
    <header class="grid items-center grid-cols-3">
      <div class="flex items-center gap-1 text-sm text-zinc-300">
        <span
          v-if="temperature"
          class="flex cursor-help items-center gap-0.5 transition-colors"
          :class="scrubSample ? 'text-zinc-100' : 'text-zinc-500'"
          :title="scrubSample ? 'Outdoor temperature at the scrubbed time' : locationName"
        >
          <Thermometer class="w-4 h-4" />
          <span class="tabular-nums">{{ temperature }}</span>
        </span>
      </div>
      <h1 class="flex items-center justify-center text-lg font-semibold leading-tight tracking-tight">
        <button
          class="flex items-center gap-1"
          aria-label="Reload app"
          title="Reload app"
          @click="reload"
        >
          <BrandMark class="w-6 h-6 rounded" />
          <span class="hidden sm:inline">{{ settings.appearance.title }}</span>
        </button>
      </h1>
      <div class="flex items-center justify-end gap-4">
        <button
          v-if="showDevicesButton"
          class="flex items-center gap-1.5 text-zinc-500 transition hover:text-zinc-300"
          aria-label="Devices"
          title="Device breakdown"
          @click="openDevices"
        >
          <Cpu class="w-5 h-5" />
          <span class="hidden text-sm font-medium sm:inline">Devices</span>
        </button>
        <button
          class="flex items-center gap-1.5 text-zinc-500 transition hover:text-zinc-300"
          aria-label="Settings"
          title="Open settings"
          @click="openSettings"
        >
          <Settings class="w-5 h-5" />
          <span class="hidden text-sm font-medium sm:inline">Settings</span>
        </button>
      </div>
    </header>

    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      leave-active-class="transition-opacity duration-200 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
      mode="out-in"
    >
    <TrendsView v-if="trendsActive" key="trends" class="flex-1" />
    <section v-else key="quadrants" class="grid flex-1 min-h-0 grid-cols-1 gap-4 quadrants sm:grid-cols-2">
      <template v-for="cell in quadrants" :key="cell.key">
        <div
          v-if="cell.key === 'battery'"
          class="relative flex flex-col h-full p-5 transition dual-cell rounded-2xl bg-zinc-900 ring-1 ring-zinc-800 hover:ring-zinc-700 @container"
        >
          <button
            class="absolute inset-y-0 left-0 z-10 w-1/2 rounded-l-2xl"
            aria-label="Open battery percent fullscreen"
            @click="open(soc)"
            @mouseenter="setHalf('battery-left')"
            @mouseleave="setHalf(null)"
          ></button>
          <button
            class="absolute inset-y-0 right-0 z-10 w-1/2 rounded-r-2xl"
            aria-label="Open battery power fullscreen"
            @click="open(power)"
            @mouseenter="setHalf('battery-right')"
            @mouseleave="setHalf(null)"
          ></button>
          <div class="flex flex-col h-full pointer-events-none">
            <div class="flex items-center justify-between">
              <span
                class="flex items-center gap-1.5 text-sm transition-opacity text-zinc-400"
                :class="{ 'opacity-30': dimmed('battery-left') }"
              >
                <component :is="socIcon" class="w-4 h-4" />{{ soc.label }}
              </span>
              <span
                v-if="batteryDirection"
                class="flex items-center gap-1 text-xs transition-opacity text-zinc-500"
                :class="{ 'opacity-30': dimmed('battery-right') }"
              >
                {{ batteryDirection }}<component :is="power.icon" class="h-3.5 w-3.5" />
              </span>
            </div>
            <div
              class="h-2 mt-4 transition-opacity rounded-full soc-bar bg-zinc-800"
              :class="{ 'opacity-30': dimmed('battery-left') }"
            >
              <div
                class="h-2 transition-all rounded-full"
                :style="{ width: socWidth, backgroundColor: socColor }"
              ></div>
            </div>
            <div
              class="flex h-4 mt-2 text-xs transition-opacity soc-eta text-zinc-500"
              :class="[
                estimateCharging ? 'justify-end' : 'justify-start',
                { 'opacity-30': estimateCharging ? dimmed('battery-right') : dimmed('battery-left') }
              ]"
            >
              <span
                class="transition-opacity duration-500"
                :class="[estimateVisible ? 'opacity-100' : 'opacity-0', estimateReady ? '' : 'text-zinc-600']"
              >{{ estimateText }}</span>
            </div>
            <div class="flex items-baseline justify-between mt-auto">
              <div
                class="flex items-baseline gap-1 transition-opacity"
                :class="{ 'opacity-30': dimmed('battery-left') }"
              >
                <span class="text-4xl font-semibold metric-value tabular-nums sm:text-5xl" :style="{ color: socColor }">
                  {{ socValue }}
                </span>
                <span class="text-sm metric-unit text-zinc-500">%</span>
              </div>
              <div
                class="flex items-baseline gap-1 transition-opacity"
                :class="{ 'opacity-30': dimmed('battery-right') }"
              >
                <component
                  :is="powerFlowIcon"
                  v-if="powerFlowIcon"
                  class="flow-arrow h-9 w-9 -mr-0.5 self-center sm:h-12 sm:w-12"
                  :stroke-width="2.5"
                  :style="{ color: powerFlowColor }"
                />
                <span class="text-4xl font-semibold metric-value tabular-nums sm:text-5xl" :style="{ color: powerColor }">
                  {{ powerValue }}
                </span>
                <span class="text-sm metric-unit text-zinc-500">{{ power.unit }}</span>
              </div>
            </div>
          </div>
        </div>

        <div
          v-else-if="cell.key === 'loadPower' && showCostTile"
          class="relative flex flex-col h-full p-5 transition dual-cell rounded-2xl bg-zinc-900 ring-1 ring-zinc-800 hover:ring-zinc-700"
        >
          <button
            class="absolute inset-y-0 left-0 z-10 w-1/2 rounded-l-2xl"
            aria-label="Open home consumption fullscreen"
            @click="open(home)"
            @mouseenter="setHalf('home-left')"
            @mouseleave="setHalf(null)"
          ></button>
          <button
            class="absolute inset-y-0 right-0 z-10 w-1/2 rounded-r-2xl"
            aria-label="Open cost fullscreen"
            @click="openCost"
            @mouseenter="setHalf('home-right')"
            @mouseleave="setHalf(null)"
          ></button>
          <div class="flex flex-col h-full pointer-events-none">
            <div class="flex items-center justify-between gap-2">
              <span
                class="flex items-center gap-1.5 text-sm transition-opacity text-zinc-400"
                :class="{ 'opacity-30': dimmed('home-left') }"
              >
                <component :is="home.icon" class="w-4 h-4" />Home
              </span>
              <span
                class="text-xs transition-opacity text-zinc-500"
                :class="{ 'opacity-30': dimmed('home-right') }"
              >{{ costLabel }}</span>
            </div>
            <div class="flex items-baseline justify-between mt-auto">
              <div
                class="flex items-baseline gap-1 transition-opacity"
                :class="{ 'opacity-30': dimmed('home-left') }"
              >
                <span class="text-4xl font-semibold metric-value tabular-nums sm:text-5xl" :style="{ color: colorOf(home) }">
                  {{ valueOf(home) }}
                </span>
                <span class="text-sm metric-unit text-zinc-500">{{ home.unit }}</span>
              </div>
              <MoneyValue
                class="text-4xl font-semibold metric-value transition-opacity sm:text-5xl"
                :class="{ 'opacity-30': dimmed('home-right') }"
                :amount="costAmount"
                :currency="costCurrency"
              />
            </div>
          </div>
        </div>

        <button
          v-else
          class="block h-full p-5 text-left transition rounded-2xl bg-zinc-900 ring-1 ring-zinc-800 hover:ring-zinc-700"
          @click="open(cell.metric)"
        >
          <span class="flex flex-col w-full h-full">
            <span class="flex items-center justify-between w-full">
              <span class="flex items-center gap-1.5 text-sm text-zinc-400">
                <component :is="cell.metric.icon" class="w-4 h-4" />{{ cell.metric.label }}
              </span>
              <span v-if="labelOf(cell.metric)" class="text-xs text-zinc-500">
                {{ labelOf(cell.metric) }}
              </span>
            </span>
            <span class="flex items-baseline gap-1 mt-auto">
              <component
                :is="flowIconOf(cell.metric)"
                v-if="flowIconOf(cell.metric)"
                class="flow-arrow -ml-1.5 h-9 w-9 -mr-0.5 self-center sm:-ml-2 sm:h-12 sm:w-12"
                :stroke-width="2.5"
                :style="{ color: flowColorOf(cell.metric) }"
              />
              <span class="text-4xl font-semibold metric-value tabular-nums sm:text-5xl" :style="{ color: colorOf(cell.metric) }">
                {{ valueOf(cell.metric) }}
              </span>
              <span class="text-sm metric-unit text-zinc-500">{{ cell.metric.unit }}</span>
            </span>
          </span>
        </button>
      </template>
    </section>
    </Transition>

    <footer class="grid grid-cols-[1fr_auto_1fr] items-center text-sm text-zinc-500">
      <div>
        <button
          class="flex items-center gap-2 transition text-zinc-500 hover:text-zinc-300"
          role="switch"
          :aria-checked="trendsActive"
          aria-label="Toggle trends view"
          title="Toggle trends view"
          @click="toggleTrends"
        >
          <span
            class="relative h-4 transition-colors rounded-full w-7 shrink-0"
            :class="trendsActive ? 'bg-zinc-300' : 'bg-zinc-700'"
          >
            <span
              class="absolute top-0.5 h-3 w-3 rounded-full transition-all"
              :class="trendsActive ? 'left-3.5 bg-zinc-950' : 'left-0.5 bg-zinc-400'"
            ></span>
          </span>
          <ChartSpline class="w-4 h-4" />
          <span class="hidden sm:inline">Trends</span>
        </button>
      </div>
      <div class="flex items-center justify-center gap-2 whitespace-nowrap text-zinc-600">
        <span v-if="!connected" class="h-1.5 w-1.5 rounded-full bg-red-500" title="Gateway unreachable"></span>
        <span>Updated {{ lastUpdated }}</span>
      </div>
      <div class="flex justify-end">
        <a
          href="https://github.com/furey/sigen-home-bridge"
          target="_blank"
          rel="noopener noreferrer"
          class="transition text-zinc-500 hover:text-zinc-300"
          aria-label="View source on GitHub"
          title="View source on GitHub"
        >
          <svg viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor" aria-hidden="true">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
          </svg>
        </a>
      </div>
    </footer>
  </main>
</template>

<style scoped>
.quadrants {
  grid-template-rows: minmax(min-content, 1.15fr) repeat(3, minmax(0, 1fr));
}

@media (min-width: 640px) {
  .quadrants {
    grid-template-rows: repeat(2, minmax(0, 1fr));
  }
}

@media (orientation: portrait) and (max-height: 760px) {
  .quadrants > button,
  .quadrants .dual-cell {
    padding: 0.875rem;
  }

  .quadrants .metric-value {
    font-size: 1.875rem;
    line-height: 2.25rem;
  }

  .quadrants .flow-arrow {
    height: 1.875rem;
    width: 1.875rem;
  }
}

@media (min-width: 640px) and (max-width: 1023px) and (min-height: 481px) {
  .dual-cell .metric-value {
    font-size: min(3rem, 5.5vw);
  }

  .dual-cell .flow-arrow {
    height: min(3rem, 5.5vw);
    width: min(3rem, 5.5vw);
  }
}

@media (min-width: 1024px) and (min-height: 481px) and (orientation: landscape) {
  main {
    --metric-fluid: min(calc(min(7vw, 14vh, 10rem) * var(--metric-scale, 1)), 10vw);
    --metric-fluid-battery: min(var(--metric-fluid), 6.5vw);
  }

  .metric-value {
    font-size: var(--metric-fluid);
    line-height: 1.05;
  }

  .flow-arrow {
    height: var(--metric-fluid);
    width: var(--metric-fluid);
  }

  .metric-unit {
    font-size: calc(var(--metric-fluid) * 0.28);
  }

  .dual-cell .metric-value {
    font-size: var(--metric-fluid-battery);
  }

  .dual-cell .flow-arrow {
    height: var(--metric-fluid-battery);
    width: var(--metric-fluid-battery);
  }

  .dual-cell .metric-unit {
    font-size: calc(var(--metric-fluid-battery) * 0.28);
  }
}

@media (orientation: landscape) and (max-height: 480px) {
  .soc-bar,
  .soc-eta {
    display: none;
  }

  .quadrants > button,
  .quadrants .dual-cell {
    padding: 0.5rem 0.875rem;
  }

  .metric-value {
    font-size: 1.75rem;
    line-height: 2rem;
  }

  .flow-arrow {
    height: 1.75rem;
    width: 1.75rem;
  }
}

</style>
