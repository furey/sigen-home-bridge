<script setup>
import { computed, onMounted, reactive } from 'vue'
import { Gauge, RotateCcw, Sun, Type, Zap } from '@lucide/vue'
import { useSettings } from '../../composables/useSettings.js'
import { useSettingsSection } from '../../composables/useSettingsSection.js'
import { DEFAULT_METRIC_SCALE, DEFAULT_POWER_DECIMALS, DEFAULT_POWER_UNIT, DEFAULT_TITLE } from '../../lib/theme.js'
import InfoTip from '../InfoTip.vue'
import SaveBar from './SaveBar.vue'
import UnsavedDialog from './UnsavedDialog.vue'

const { data, loadOnce } = useSettings()

const form = reactive({
  title: DEFAULT_TITLE,
  metricScale: DEFAULT_METRIC_SCALE,
  powerUnit: DEFAULT_POWER_UNIT,
  powerDecimals: DEFAULT_POWER_DECIMALS
})

const { status, error, dirty, save, markPristine, pendingLeave, confirmLeave, cancelLeave } =
  useSettingsSection({ snapshot, buildPatch })

const PREVIEW_BASE_PX = 72
const PREVIEW_CAP_PX = 120
const SIZE_MIN_PERCENT = 50
const SIZE_MAX_PERCENT = 150
const SIZE_DEFAULT_PERCENT = 100

const sizePercent = computed({
  get: () => Math.round((form.metricScale / DEFAULT_METRIC_SCALE) * 100),
  set: (percent) => { form.metricScale = (percent / 100) * DEFAULT_METRIC_SCALE }
})
const atDefaultSize = computed(() => sizePercent.value === SIZE_DEFAULT_PERCENT)
const resetSize = () => { sizePercent.value = SIZE_DEFAULT_PERCENT }

const EXAMPLE_WATTS = 3456
const examplePower = computed(() => form.powerUnit === 'W'
  ? `${EXAMPLE_WATTS}`
  : (EXAMPLE_WATTS / 1000).toFixed(form.powerDecimals))

const previewNumberPx = computed(() => Math.min(PREVIEW_BASE_PX * form.metricScale, PREVIEW_CAP_PX))
const numberStyle = computed(() => ({
  color: data.appearance.theme.colors.solarMid,
  fontSize: `${previewNumberPx.value}px`,
  lineHeight: '1.05'
}))
const unitStyle = computed(() => ({ fontSize: `${Math.round(previewNumberPx.value * 0.28)}px` }))

onMounted(async () => {
  await loadOnce()
  form.title = data.appearance.title
  form.metricScale = data.appearance.metricScale
  form.powerUnit = data.appearance.powerUnit
  form.powerDecimals = data.appearance.powerDecimals
  markPristine()
})

function snapshot() {
  return {
    title: form.title.trim() || DEFAULT_TITLE,
    metricScale: Number(form.metricScale) || DEFAULT_METRIC_SCALE,
    powerUnit: form.powerUnit,
    powerDecimals: Number(form.powerDecimals)
  }
}

function buildPatch() {
  return {
    appearance: {
      title: form.title.trim() || DEFAULT_TITLE,
      metricScale: Number(form.metricScale) || DEFAULT_METRIC_SCALE,
      powerUnit: form.powerUnit,
      powerDecimals: Number(form.powerDecimals)
    }
  }
}
</script>

<template>
  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <Type class="w-4 h-4" />Dashboard title
    </div>
    <input v-model="form.title" type="text" :placeholder="DEFAULT_TITLE" maxlength="60"
      class="w-full px-3 py-2 rounded-lg bg-zinc-800" />
    <p class="mt-2 text-xs text-zinc-500">Shown in the dashboard header and the browser tab.</p>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <Zap class="w-4 h-4" />Power readings
    </div>
    <p class="mb-3 text-xs text-zinc-500">
      The unit and precision used for solar, grid, battery and home power across the dashboard,
      trends and fullscreen views.
    </p>
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="block">
        <span class="block mb-1 text-sm text-zinc-400">Unit</span>
        <select v-model="form.powerUnit" class="w-full px-3 py-2 rounded-lg bg-zinc-800">
          <option value="kW">Kilowatts (kW)</option>
          <option value="W">Watts (W)</option>
        </select>
      </label>
      <label v-if="form.powerUnit === 'kW'" class="block">
        <span class="block mb-1 text-sm text-zinc-400">Decimal places</span>
        <select v-model.number="form.powerDecimals" class="w-full px-3 py-2 rounded-lg bg-zinc-800 tabular-nums">
          <option :value="0">0</option>
          <option :value="1">1</option>
          <option :value="2">2</option>
          <option :value="3">3</option>
        </select>
      </label>
    </div>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2 text-sm text-zinc-400">
        <Gauge class="w-4 h-4" />Reading size<InfoTip topic="metricScale" />
      </div>
      <div class="flex items-center gap-3">
        <button
          v-if="!atDefaultSize"
          class="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
          @click="resetSize"
        >
          <RotateCcw class="w-3.5 h-3.5" />Reset
        </button>
        <span class="tabular-nums text-sm text-zinc-300">{{ sizePercent }}%</span>
      </div>
    </div>
    <p class="mb-3 text-xs text-zinc-500">
      How large the dashboard's headline numbers appear on the desktop layout, shown on an
      example solar tile. Phones and portrait tablets use a fixed size and aren't affected.
    </p>
    <div class="flex flex-col p-5 mb-4 overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-zinc-800 min-h-40">
      <div class="flex items-center gap-2 text-sm text-zinc-400">
        <Sun class="w-4 h-4" />Solar
      </div>
      <div class="flex items-baseline gap-1.5 mt-auto">
        <span class="font-semibold tabular-nums" :style="numberStyle">{{ examplePower }}</span>
        <span class="text-zinc-500" :style="unitStyle">{{ form.powerUnit }}</span>
      </div>
    </div>
    <input v-model.number="sizePercent" type="range" :min="SIZE_MIN_PERCENT" :max="SIZE_MAX_PERCENT"
      step="5" class="w-full" />
  </section>

  <SaveBar :status="status" :error="error" :dirty="dirty" @save="save" />
  <UnsavedDialog :open="pendingLeave" @confirm="confirmLeave" @cancel="cancelLeave" />
</template>
