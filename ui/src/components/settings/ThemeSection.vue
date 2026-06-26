<script setup>
import { computed, onMounted, reactive } from 'vue'
import { ArrowDown, ArrowUp, BatteryMedium, Cable, CircleDollarSign, House, Palette, Sun, Zap } from '@lucide/vue'
import { useSettings } from '../../composables/useSettings.js'
import { useSettingsSection } from '../../composables/useSettingsSection.js'
import { FLOW_ARROW_DIM, lerpHex } from '../../lib/metrics.js'
import { DEFAULT_COLORS, THEME_PRESETS, isHexColor, presetMatching } from '../../lib/theme.js'
import SaveBar from './SaveBar.vue'
import UnsavedDialog from './UnsavedDialog.vue'

const { data, loadOnce } = useSettings()

const form = reactive({ colors: { ...DEFAULT_COLORS } })

const { status, error, dirty, save, markPristine, pendingLeave, confirmLeave, cancelLeave } =
  useSettingsSection({ snapshot, buildPatch })

const selectedPreset = computed({
  get: () => presetMatching(form.colors)?.key ?? 'custom',
  set: (key) => {
    const preset = THEME_PRESETS.find((entry) => entry.key === key)
    if (preset) Object.assign(form.colors, preset.colors)
  }
})

const preview = computed(() => [
  { key: 'solar', icon: Sun, value: '3.50', unit: 'kW', color: form.colors.solarMid },
  { key: 'soc', icon: BatteryMedium, value: '85', unit: '%', color: form.colors.socHigh },
  {
    key: 'grid', icon: Cable, value: '0.42', unit: 'kW',
    color: form.colors.gridImport, arrow: ArrowDown, arrowColor: arrowShade(form.colors.gridImport)
  },
  {
    key: 'battery', icon: Zap, value: '1.20', unit: 'kW',
    color: form.colors.batteryDischarge, arrow: ArrowUp,
    arrowColor: arrowShade(form.colors.batteryDischarge)
  },
  { key: 'home', icon: House, value: '1.62', unit: 'kW', color: form.colors.home },
  { key: 'cost', icon: CircleDollarSign, value: '4.89', unit: 'cost', color: form.colors.cost },
  { key: 'credit', icon: CircleDollarSign, value: '0.80', unit: 'credit', color: form.colors.credit }
])

onMounted(async () => {
  await loadOnce()
  Object.assign(form.colors, DEFAULT_COLORS, data.appearance.theme.colors)
  markPristine()
})

const onHexInput = (key, event) => {
  const raw = event.target.value.trim()
  const hex = raw.startsWith('#') ? raw : `#${raw}`
  if (isHexColor(hex)) form.colors[key] = hex.toLowerCase()
  event.target.value = form.colors[key]
}

function snapshot() {
  return { preset: selectedPreset.value, colors: form.colors }
}

function buildPatch() {
  return { appearance: { theme: { preset: selectedPreset.value, colors: { ...form.colors } } } }
}

const arrowShade = (hex) => lerpHex(hex, '#000000', FLOW_ARROW_DIM)

const COLOR_COLUMNS = [
  [
    {
      label: 'Battery level',
      slots: [['socHigh', 'Healthy'], ['socMedium', 'Low'], ['socLow', 'Critical']]
    },
    {
      label: 'Battery flow',
      slots: [['batteryCharge', 'Charging'], ['batteryDischarge', 'Discharging']]
    },
    { label: 'Home', slots: [['home', 'Consumption']] },
    { label: 'Cost', slots: [['cost', 'Paying'], ['credit', 'Earning']] }
  ],
  [
    {
      label: 'Solar',
      slots: [
        ['solarAccent', 'Trend line'],
        ['solarLow', 'Low output'],
        ['solarMid', 'Mid output'],
        ['solarHigh', 'High output']
      ]
    },
    {
      label: 'Grid flow',
      slots: [['gridImport', 'Importing'], ['gridExport', 'Exporting']]
    },
    { label: 'Idle', slots: [['idle', 'Zero / idle']] }
  ]
]
</script>

<template>
  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div>
      <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
        <Palette class="w-4 h-4" />Theme &amp; colours
      </div>
      <div class="flex flex-wrap items-center px-4 py-3 gap-x-5 gap-y-2 rounded-xl bg-zinc-950 ring-1 ring-zinc-800">
        <span v-for="chip in preview" :key="chip.key" class="flex items-baseline gap-1">
          <component :is="chip.icon" class="self-center w-4 h-4 text-zinc-400" />
          <component
            :is="chip.arrow"
            v-if="chip.arrow"
            class="self-center w-5 h-5"
            :stroke-width="2.5"
            :style="{ color: chip.arrowColor }"
          />
          <span class="text-lg font-semibold tabular-nums" :style="{ color: chip.color }">
            {{ chip.value }}
          </span>
          <span class="text-xs text-zinc-500">{{ chip.unit }}</span>
        </span>
      </div>
      <label class="block mt-4">
        <span class="block mb-1 text-sm text-zinc-400">Preset</span>
        <select v-model="selectedPreset" class="w-full px-3 py-2 rounded-lg bg-zinc-800 sm:max-w-xs">
          <option v-for="preset in THEME_PRESETS" :key="preset.key" :value="preset.key">
            {{ preset.label }}
          </option>
          <option value="custom" disabled>Custom</option>
        </select>
      </label>
    </div>

    <div class="grid gap-4 mt-4 sm:grid-cols-2">
      <div v-for="(column, columnIndex) in COLOR_COLUMNS" :key="columnIndex" class="space-y-4">
        <div v-for="group in column" :key="group.label">
          <span class="block mb-1 text-sm text-zinc-400">{{ group.label }}</span>
          <div class="space-y-2">
            <div v-for="[key, label] in group.slots" :key="key" class="flex items-center gap-2">
              <input
                type="color"
                :value="form.colors[key]"
                class="w-10 h-8 rounded cursor-pointer bg-zinc-800"
                :aria-label="`${group.label} ${label} colour`"
                @input="form.colors[key] = $event.target.value"
              />
              <input
                :value="form.colors[key]"
                type="text"
                spellcheck="false"
                class="w-24 rounded-lg bg-zinc-800 px-2 py-1.5 text-sm tabular-nums"
                :aria-label="`${group.label} ${label} hex value`"
                @change="onHexInput(key, $event)"
              />
              <span class="text-xs text-zinc-500">{{ label }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <SaveBar :status="status" :error="error" :dirty="dirty" @save="save" />
  <UnsavedDialog :open="pendingLeave" @confirm="confirmLeave" @cancel="cancelLeave" />
</template>
