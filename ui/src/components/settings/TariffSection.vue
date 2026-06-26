<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import {
  ArrowDownToLine, ArrowUpFromLine, CircleDollarSign, Clock, ExternalLink, Plus, TriangleAlert, X
} from '@lucide/vue'
import { useSettings } from '../../composables/useSettings.js'
import { useSettingsSection } from '../../composables/useSettingsSection.js'
import InfoTip from '../InfoTip.vue'
import HowTo from './HowTo.vue'
import SaveBar from './SaveBar.vue'
import UnsavedDialog from './UnsavedDialog.vue'

const REPO_URL = 'https://github.com/furey/sigen-home-bridge'
const DEEP_DIVE_URL = `${REPO_URL}/blob/main/docs/DEEP_DIVE.md`
const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'CAD']

const { data, loadOnce } = useSettings()

const form = reactive({
  showOnDashboard: false,
  costMode: 'perDay',
  currency: 'USD',
  importRate: 0,
  exportRate: 0,
  supplyChargePerDay: 0
})
const importWindows = ref([])
const exportWindows = ref([])
const zeroDraw = reactive({ enabled: false, start: '18:00', end: '21:00', perDay: 0 })
const superExport = reactive({ enabled: false, start: '16:00', end: '23:00', capKwh: 15, rate: 0 })

const { status, error, dirty, save, markPristine, pendingLeave, confirmLeave, cancelLeave } =
  useSettingsSection({ snapshot, buildPatch })

onMounted(async () => {
  await loadOnce()
  const tariff = data.tariff ?? {}
  form.showOnDashboard = Boolean(tariff.showOnDashboard)
  form.costMode = tariff.costMode ?? 'perDay'
  form.currency = tariff.currency ?? 'USD'
  form.importRate = tariff.importRate ?? 0
  form.exportRate = tariff.exportRate ?? 0
  form.supplyChargePerDay = tariff.supplyChargePerDay ?? 0
  importWindows.value = (tariff.importWindows ?? []).map((window) => ({ ...window }))
  exportWindows.value = (tariff.exportWindows ?? []).map((window) => ({ ...window }))
  Object.assign(zeroDraw, tariff.zeroDrawCredit ?? {})
  Object.assign(superExport, tariff.superExportCredit ?? {})
  markPristine()
})

const addImport = () => importWindows.value.push({ start: '16:00', end: '23:00', rate: 0 })
const removeImport = (index) => importWindows.value.splice(index, 1)
const addExport = () => exportWindows.value.push({ start: '16:00', end: '23:00', rate: 0 })
const removeExport = (index) => exportWindows.value.splice(index, 1)

const num = (value) => Number(value) || 0
const cleanWindows = (windows) =>
  windows.map(({ start, end, rate }) => ({ start, end, rate: num(rate) }))

const dashboardExplainer = computed(() =>
  form.costMode === 'perHour'
    ? 'The Home tile shows your current cost per hour at the active rate (a credit while exporting).'
    : "The Home tile shows today's net so far: feed-in and credits minus import and the daily supply charge.")

function snapshot() {
  return {
    showOnDashboard: form.showOnDashboard,
    costMode: form.costMode,
    currency: (form.currency || 'USD').trim().toUpperCase(),
    supplyChargePerDay: num(form.supplyChargePerDay),
    importRate: num(form.importRate),
    exportRate: num(form.exportRate),
    importWindows: cleanWindows(importWindows.value),
    exportWindows: cleanWindows(exportWindows.value),
    superExportCredit: {
      enabled: superExport.enabled,
      start: superExport.start,
      end: superExport.end,
      capKwh: num(superExport.capKwh),
      rate: num(superExport.rate)
    },
    zeroDrawCredit: {
      enabled: zeroDraw.enabled,
      start: zeroDraw.start,
      end: zeroDraw.end,
      perDay: num(zeroDraw.perDay)
    }
  }
}

function buildPatch() {
  return { tariff: snapshot() }
}
</script>

<template>
  <HowTo title="How tariffs work">
    <p>
      Set the rate you pay per kWh imported from the grid and earn per kWh exported. Those are the
      fallback rates, used whenever no time-of-use window covers the current time (your shoulder or
      anytime rate). Add windows to override the fallback for peak, off-peak, or feed-in periods; a
      free period is just a window with a rate of 0. Windows wrap past midnight (e.g. 23:00 to 06:00).
    </p>
    <p>
      When enabled, the dashboard's Home tile shows a live running cost, and tapping it opens a
      fullscreen breakdown of today's supply charge, import, export, credits, and net.
    </p>
    <div class="p-3 space-y-1 rounded-lg bg-amber-500/5 ring-1 ring-amber-500/20">
      <p class="flex items-center gap-1.5 text-xs font-medium text-amber-300">
        <TriangleAlert class="w-3.5 h-3.5" />Estimate only
      </p>
      <p class="text-xs text-zinc-400">
        Costs are a best guess from the figures you enter and the gateway's power readings. Real bills
        carry exceptions this app can't model: daily volume caps (like a free-window kWh limit), demand
        charges, GST and rounding, tiered or seasonal rates, controlled-load circuits, and meter-time
        quirks such as windows that shift an hour over daylight saving. Treat the numbers as a guide,
        not a bill.
      </p>
    </div>
    <a :href="`${DEEP_DIVE_URL}#energy-tariffs`" target="_blank" rel="noopener"
      class="inline-flex items-center gap-1 text-zinc-300 hover:text-zinc-100">
      Energy tariffs (<span class="font-mono">DEEP_DIVE.md</span>)<ExternalLink class="w-3.5 h-3.5" />
    </a>
  </HowTo>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <CircleDollarSign class="w-4 h-4" />Tariff
    </div>
    <label class="flex items-center gap-2 text-sm text-zinc-300">
      <input v-model="form.showOnDashboard" type="checkbox" class="w-4 h-4" />
      Show cost on the dashboard
    </label>
    <p class="mt-1 mb-4 ml-6 text-xs text-zinc-500">{{ dashboardExplainer }}</p>
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="block">
        <span class="block mb-1 text-sm text-zinc-400">Dashboard shows</span>
        <select v-model="form.costMode" class="w-full px-3 py-2 rounded-lg bg-zinc-800">
          <option value="perDay">Today's running total</option>
          <option value="perHour">Current cost per hour</option>
        </select>
      </label>
      <label class="block">
        <span class="block mb-1 text-sm text-zinc-400">Currency</span>
        <input v-model="form.currency" list="tariff-currencies" type="text" maxlength="3"
          placeholder="USD" class="w-full px-3 py-2 uppercase rounded-lg bg-zinc-800" />
        <datalist id="tariff-currencies">
          <option v-for="code in CURRENCIES" :key="code" :value="code" />
        </datalist>
      </label>
    </div>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <Clock class="w-4 h-4" />Daily supply charge
    </div>
    <label class="block">
      <input v-model.number="form.supplyChargePerDay" type="number" step="any" min="0"
        class="w-32 px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
      <span class="block mt-1 text-xs text-zinc-500">Fixed daily charge, applied in full to today's net.</span>
    </label>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <ArrowDownToLine class="w-4 h-4" />Import
    </div>
    <label class="block">
      <span class="flex items-center gap-1 mb-1 text-sm text-zinc-400">
        Rate per kWh<InfoTip topic="tariffRates" />
      </span>
      <input v-model.number="form.importRate" type="number" step="any" min="0"
        class="w-32 px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
      <span class="block mt-1 text-xs text-zinc-500">The anytime / shoulder rate when no window applies.</span>
    </label>
    <div class="mt-4">
      <div class="flex items-center justify-between mb-1">
        <span class="flex items-center gap-1 text-sm text-zinc-400">
          Time-of-use windows<InfoTip topic="tariffWindows" />
        </span>
        <button class="flex items-center gap-1 text-sm text-zinc-300 hover:text-white" @click="addImport">
          <Plus class="w-4 h-4" />Add window
        </button>
      </div>
      <p v-if="!importWindows.length" class="text-sm text-zinc-600">No windows; the rate above applies all day.</p>
      <div v-for="(win, index) in importWindows" :key="index" class="flex items-center gap-2 mb-2">
        <input v-model="win.start" type="time" class="px-2 py-2 rounded-lg bg-zinc-800" />
        <span class="text-zinc-600">&rarr;</span>
        <input v-model="win.end" type="time" class="px-2 py-2 rounded-lg bg-zinc-800" />
        <span class="text-zinc-600">@</span>
        <input v-model.number="win.rate" type="number" step="any" min="0"
          class="w-24 px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
        <span class="text-sm text-zinc-500">/kWh</span>
        <button class="ml-auto text-zinc-500 hover:text-red-400" aria-label="Remove window" @click="removeImport(index)">
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <ArrowUpFromLine class="w-4 h-4" />Export (feed-in)
    </div>
    <label class="block">
      <span class="flex items-center gap-1 mb-1 text-sm text-zinc-400">
        Rate per kWh<InfoTip topic="tariffRates" />
      </span>
      <input v-model.number="form.exportRate" type="number" step="any" min="0"
        class="w-32 px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
      <span class="block mt-1 text-xs text-zinc-500">The anytime feed-in rate when no window applies.</span>
    </label>
    <div class="mt-4">
      <div class="flex items-center justify-between mb-1">
        <span class="flex items-center gap-1 text-sm text-zinc-400">
          Time-of-use windows<InfoTip topic="tariffWindows" />
        </span>
        <button class="flex items-center gap-1 text-sm text-zinc-300 hover:text-white" @click="addExport">
          <Plus class="w-4 h-4" />Add window
        </button>
      </div>
      <p v-if="!exportWindows.length" class="text-sm text-zinc-600">No windows; the rate above applies all day.</p>
      <div v-for="(win, index) in exportWindows" :key="index" class="flex items-center gap-2 mb-2">
        <input v-model="win.start" type="time" class="px-2 py-2 rounded-lg bg-zinc-800" />
        <span class="text-zinc-600">&rarr;</span>
        <input v-model="win.end" type="time" class="px-2 py-2 rounded-lg bg-zinc-800" />
        <span class="text-zinc-600">@</span>
        <input v-model.number="win.rate" type="number" step="any" min="0"
          class="w-24 px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
        <span class="text-sm text-zinc-500">/kWh</span>
        <button class="ml-auto text-zinc-500 hover:text-red-400" aria-label="Remove window" @click="removeExport(index)">
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center justify-between mb-3">
      <span class="text-sm text-zinc-400">Super-export credit</span>
      <label class="flex items-center gap-2 text-sm text-zinc-300">
        <input v-model="superExport.enabled" type="checkbox" class="w-4 h-4" />Enabled
      </label>
    </div>
    <p class="mb-3 text-xs text-zinc-500">
      A bonus rate for the first capped kWh you export inside the window each day.
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <input v-model="superExport.start" type="time" class="px-2 py-2 rounded-lg bg-zinc-800" />
      <span class="text-zinc-600">&rarr;</span>
      <input v-model="superExport.end" type="time" class="px-2 py-2 rounded-lg bg-zinc-800" />
      <span class="ml-2 text-sm text-zinc-500">first</span>
      <input v-model.number="superExport.capKwh" type="number" step="any" min="0"
        class="w-20 px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
      <span class="text-sm text-zinc-500">kWh @</span>
      <input v-model.number="superExport.rate" type="number" step="any" min="0"
        class="w-24 px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
      <span class="text-sm text-zinc-500">/kWh</span>
    </div>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center justify-between mb-3">
      <span class="flex items-center gap-1 text-sm text-zinc-400">
        Zero-draw credit
      </span>
      <label class="flex items-center gap-2 text-sm text-zinc-300">
        <input v-model="zeroDraw.enabled" type="checkbox" class="w-4 h-4" />Enabled
      </label>
    </div>
    <p class="mb-3 text-xs text-zinc-500">
      A flat amount earned each day you pull no grid power across the window below.
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <input v-model="zeroDraw.start" type="time" class="px-2 py-2 rounded-lg bg-zinc-800" />
      <span class="text-zinc-600">&rarr;</span>
      <input v-model="zeroDraw.end" type="time" class="px-2 py-2 rounded-lg bg-zinc-800" />
      <span class="ml-2 text-sm text-zinc-500">credit</span>
      <input v-model.number="zeroDraw.perDay" type="number" step="any" min="0"
        class="w-24 px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
      <span class="text-sm text-zinc-500">/day</span>
    </div>
  </section>

  <SaveBar :status="status" :error="error" :dirty="dirty" @save="save">
    <template #hint>
      <span class="text-xs text-right text-zinc-600 text-balance">
        Cost figures update live; no restart needed.
      </span>
    </template>
  </SaveBar>
  <UnsavedDialog :open="pendingLeave" @confirm="confirmLeave" @cancel="cancelLeave" />
</template>
