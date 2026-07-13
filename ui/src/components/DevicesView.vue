<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, BatteryFull, Cpu, Gauge, HeartPulse, Plug, Settings, Sun, Thermometer } from '@lucide/vue'
import { useStateStream } from '../composables/useStateStream.js'
import { accentFor, categoryAccentFor, formatPower, metricByKey } from '../lib/metrics.js'
import { displayPrefs } from '../lib/theme.js'
import BrandMark from './BrandMark.vue'
import InfoTip from './InfoTip.vue'

const TIME_FORMAT = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }

const STATUS_STYLES = {
  running: 'bg-green-500/10 text-green-400',
  standby: 'bg-zinc-700/40 text-zinc-300',
  fault: 'bg-red-500/10 text-red-400',
  shutdown: 'bg-amber-500/10 text-amber-400',
  unknown: 'bg-zinc-700/40 text-zinc-400'
}

const { state, connected } = useStateStream()
const router = useRouter()

const solar = metricByKey('pvPower')
const home = metricByKey('loadPower')
const powerUnit = computed(() => displayPrefs.powerUnit)

const inverters = computed(() => state.devices.filter((device) => device.type === 'inverter'))
const smartLoads = computed(() => state.devices.filter((device) => device.type === 'smartLoad'))
const hasDevices = computed(() => inverters.value.length > 0 || smartLoads.value.length > 0)

const lastUpdated = computed(() =>
  state.lastUpdated
    ? new Date(state.lastUpdated).toLocaleTimeString([], TIME_FORMAT)
    : '—')

const back = () => router.push({ name: 'dashboard' })
const openSettings = () => router.push({ name: 'settings' })
const reload = () => window.location.reload()

const statusStyle = (status) => STATUS_STYLES[status] ?? STATUS_STYLES.unknown
const solarAccent = (watts) => categoryAccentFor(solar, watts)
const activeLabel = (watts) => `${formatPower(watts, { signed: true })} ${powerUnit.value}`
const isProducing = (device) => device.solarPower > 0
const loadAccent = (watts) => accentFor(home, watts)
const isDrawing = (load) => load.power !== 0
const loadStyle = (load) => (isDrawing(load) ? STATUS_STYLES.running : STATUS_STYLES.standby)
const energyLabel = (kwh) => (kwh >= 1000 ? Math.round(kwh).toLocaleString() : kwh)
const peakStringPower = (strings) => Math.max(1, ...strings.map((string) => string.power))
const stringWidth = (string, strings) =>
  `${Math.min(100, (string.power / peakStringPower(strings)) * 100)}%`

const onKey = (event) => { if (event.key === 'Escape') back() }
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <main class="flex flex-col gap-3 min-h-app p-safe sm:gap-4">
    <header class="grid items-center grid-cols-3">
      <div class="flex justify-start">
        <button
          class="flex items-center gap-1.5 text-zinc-500 transition hover:text-zinc-300"
          aria-label="Back to dashboard"
          title="Back to dashboard"
          @click="back"
        >
          <ArrowLeft class="w-5 h-5" />
          <span class="hidden text-sm font-medium sm:inline">Dashboard</span>
        </button>
      </div>
      <h1 class="flex items-center justify-center text-lg font-semibold leading-tight tracking-tight">
        <button
          class="flex items-center gap-1"
          aria-label="Reload app"
          title="Reload app"
          @click="reload"
        >
          <BrandMark class="w-6 h-6 rounded" />
          <span class="hidden sm:inline">Device Breakdown</span>
        </button>
      </h1>
      <div class="flex justify-end">
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

    <div class="flex-1">
      <section v-if="hasDevices" class="flex flex-col gap-3 sm:gap-4">
        <article
          v-for="device in inverters"
          :key="device.unitId"
          class="p-4 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800 sm:p-5"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 text-zinc-200">
                <Cpu class="w-4 h-4 shrink-0 text-zinc-400" />
                <span class="font-medium truncate">{{ device.model }}</span>
              </div>
              <p class="mt-1 text-xs truncate text-zinc-500">
                {{ device.serial }} · Unit {{ device.unitId }}
              </p>
            </div>
            <span class="flex items-center gap-1.5 shrink-0">
              <span
                class="capitalize rounded-full px-2.5 py-0.5 text-xs font-medium"
                :class="statusStyle(device.status)"
              >
                {{ device.status }}
              </span>
              <InfoTip topic="deviceStatus" align="right" />
            </span>
          </div>

          <div class="mt-5">
            <div class="flex items-baseline gap-2">
              <Sun class="self-center w-5 h-5" :style="{ color: solarAccent(device.solarPower) }" />
              <span
                class="text-4xl font-semibold tabular-nums"
                :style="{ color: solarAccent(device.solarPower) }"
              >
                {{ solar.format(device.solarPower) }}
              </span>
              <span class="text-sm text-zinc-500">{{ powerUnit }} solar</span>
              <InfoTip topic="deviceSolar" />
            </div>
            <p v-if="!isProducing(device)" class="mt-1 text-xs text-zinc-600">
              No production right now
            </p>
          </div>

          <dl class="grid grid-cols-2 mt-5 gap-x-6 gap-y-3 sm:grid-cols-4">
            <div>
              <dt class="flex items-center gap-1 text-xs text-zinc-500">
                <Gauge class="w-3.5 h-3.5" />Active power<InfoTip topic="deviceActivePower" />
              </dt>
              <dd class="mt-0.5 tabular-nums text-zinc-200">{{ activeLabel(device.activePower) }}</dd>
            </div>
            <div>
              <dt class="flex items-center gap-1 text-xs text-zinc-500">
                <Thermometer class="w-3.5 h-3.5" />Temperature<InfoTip topic="deviceTemperature" />
              </dt>
              <dd class="mt-0.5 tabular-nums text-zinc-200">{{ device.temperature }}°C</dd>
            </div>
            <div>
              <dt class="flex items-center gap-1 text-xs text-zinc-500">
                <BatteryFull class="w-3.5 h-3.5" />Charge<InfoTip topic="deviceSoc" />
              </dt>
              <dd class="mt-0.5 tabular-nums text-zinc-200">{{ device.soc }}%</dd>
            </div>
            <div>
              <dt class="flex items-center gap-1 text-xs text-zinc-500">
                <HeartPulse class="w-3.5 h-3.5" />Health<InfoTip topic="deviceSoh" />
              </dt>
              <dd class="mt-0.5 tabular-nums text-zinc-200">{{ device.soh }}%</dd>
            </div>
          </dl>

          <div v-if="device.strings.length" class="pt-4 mt-5 border-t border-zinc-800">
            <div class="flex items-center justify-between mb-3 text-xs text-zinc-500">
              <span class="flex items-center gap-1"><Sun class="w-3.5 h-3.5" />PV strings<InfoTip topic="deviceStrings" /></span>
              <span v-if="!isProducing(device)">No production right now</span>
            </div>
            <ul class="space-y-3">
              <li v-for="string in device.strings" :key="string.index" class="space-y-1">
                <div class="flex items-baseline justify-between text-xs">
                  <span class="text-zinc-400">{{ string.name || `String ${string.index}` }}</span>
                  <span class="tabular-nums text-zinc-300">{{ string.power }} W</span>
                </div>
                <div class="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    class="h-full transition-all rounded-full"
                    :style="{ width: stringWidth(string, device.strings), backgroundColor: solarAccent(string.power) }"
                  ></div>
                </div>
                <div class="flex gap-3 text-xs tabular-nums text-zinc-500">
                  <span>{{ string.voltage }} V</span>
                  <span>{{ string.current }} A</span>
                </div>
              </li>
            </ul>
          </div>
        </article>

        <article
          v-for="load in smartLoads"
          :key="`smartLoad-${load.index}`"
          class="p-4 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800 sm:p-5"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 text-zinc-200">
                <Plug class="w-4 h-4 shrink-0 text-zinc-400" />
                <span class="font-medium truncate">{{ load.name }}</span>
              </div>
              <p class="mt-1 text-xs truncate text-zinc-500">
                Smart Port · Load {{ load.index }}
              </p>
            </div>
            <span class="flex items-center gap-1.5 shrink-0">
              <span
                class="rounded-full px-2.5 py-0.5 text-xs font-medium"
                :class="loadStyle(load)"
              >
                {{ isDrawing(load) ? 'Drawing' : 'Idle' }}
              </span>
              <InfoTip topic="smartLoadStatus" align="right" />
            </span>
          </div>

          <div class="mt-5">
            <div class="flex items-baseline gap-2">
              <Plug class="self-center w-5 h-5" :style="{ color: loadAccent(load.power) }" />
              <span
                class="text-4xl font-semibold tabular-nums"
                :style="{ color: loadAccent(load.power) }"
              >
                {{ formatPower(load.power, { signed: true }) }}
              </span>
              <span class="text-sm text-zinc-500">{{ powerUnit }}</span>
              <InfoTip topic="smartLoadPower" />
            </div>
            <p v-if="!isDrawing(load)" class="mt-1 text-xs text-zinc-600">
              No draw right now
            </p>
          </div>

          <dl class="grid grid-cols-2 mt-5 gap-x-6 gap-y-3 sm:grid-cols-4">
            <div>
              <dt class="flex items-center gap-1 text-xs text-zinc-500">
                <Gauge class="w-3.5 h-3.5" />Lifetime energy<InfoTip topic="smartLoadEnergy" />
              </dt>
              <dd class="mt-0.5 tabular-nums text-zinc-200">{{ energyLabel(load.lifetimeEnergy) }} kWh</dd>
            </div>
          </dl>
        </article>
      </section>

      <div v-else class="flex flex-col items-center justify-center h-full gap-3 text-center">
        <Cpu class="w-10 h-10 text-zinc-700" />
        <p class="text-zinc-400">No devices discovered</p>
        <p class="max-w-sm text-sm text-zinc-600 text-pretty">
          Inverters and Smart Port loads appear here once the bridge discovers them on the gateway.
          {{ connected ? 'None were found on this gateway.' : 'The gateway is currently unreachable.' }}
        </p>
      </div>
    </div>

    <footer class="grid grid-cols-[1fr_auto_1fr] items-center text-sm text-zinc-500">
      <div></div>
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
