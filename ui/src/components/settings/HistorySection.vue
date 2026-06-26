<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Database, FileJson, FileSpreadsheet, Hourglass, RotateCcw } from '@lucide/vue'
import { useSettings } from '../../composables/useSettings.js'
import { useSettingsSection } from '../../composables/useSettingsSection.js'
import { downloadUrl } from '../../lib/download.js'
import { withMinDuration } from '../../lib/withMinDuration.js'
import SaveBar from './SaveBar.vue'
import UnsavedDialog from './UnsavedDialog.vue'

const { data, loadOnce } = useSettings()

const form = reactive({ retentionDays: 7 })
const resolution = ref('raw')
const stats = ref(null)
const exporting = ref(null)
const exportError = ref('')

const RETENTION_MIN = 1
const RETENTION_MAX = 90
const RETENTION_DEFAULT = 7

const RESOLUTIONS = [
  { value: 'raw', label: 'Every sample' },
  { value: '60', label: '1 minute' },
  { value: '300', label: '5 minutes' },
  { value: '900', label: '15 minutes' }
]

const { status, error, dirty, save, markPristine, pendingLeave, confirmLeave, cancelLeave } =
  useSettingsSection({ snapshot, buildPatch })

onMounted(async () => {
  await loadOnce()
  form.retentionDays = data.history.retentionDays
  markPristine()
  loadStats()
})

const loadStats = async () => {
  try {
    stats.value = await (await fetch('/api/history/stats')).json()
  } catch {
    stats.value = null
  }
}

const exportHref = (format) => `/api/history/export?format=${format}&every=${resolution.value}`

const downloadExport = async (format) => {
  exporting.value = format
  exportError.value = ''
  try {
    const stamp = new Date().toISOString().slice(0, 10)
    await withMinDuration(
      downloadUrl({ url: exportHref(format), filename: `sigen-history-${stamp}.${format}` })
    )
  } catch {
    exportError.value = 'Could not prepare the export. Try again.'
  } finally {
    exporting.value = null
  }
}

const atDefaultRetention = computed(() => form.retentionDays === RETENTION_DEFAULT)
const resetRetention = () => { form.retentionDays = RETENTION_DEFAULT }

const sampleCount = computed(() => stats.value?.count ?? 0)

const spanLabel = computed(() => {
  if (!stats.value || stats.value.firstT === null) return null
  const days = (stats.value.lastT - stats.value.firstT) / 86400000
  if (days >= 1) return `${days.toFixed(1)} days`
  const hours = days * 24
  return hours >= 1 ? `${hours.toFixed(1)} hours` : 'under an hour'
})

function snapshot() {
  return { retentionDays: Number(form.retentionDays) }
}

function buildPatch() {
  return { history: { retentionDays: Number(form.retentionDays) } }
}
</script>

<template>
  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2 text-sm text-zinc-400">
        <Hourglass class="w-4 h-4" />Retention window
      </div>
      <div class="flex items-center gap-3">
        <button
          v-if="!atDefaultRetention"
          class="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
          @click="resetRetention"
        >
          <RotateCcw class="w-3.5 h-3.5" />Reset
        </button>
        <span class="text-sm text-zinc-300 tabular-nums">{{ form.retentionDays }} days</span>
      </div>
    </div>
    <p class="mb-3 text-xs text-zinc-500">
      How long recorded readings are kept for the Trends chart and export. Older samples are dropped;
      lowering this discards anything past the new window. Longer windows hold more in memory — at a
      5-second poll a week is roughly 120,000 readings.
    </p>
    <input v-model.number="form.retentionDays" type="range" :min="RETENTION_MIN" :max="RETENTION_MAX"
      step="1" class="w-full" />
  </section>

  <SaveBar :status="status" :error="error" :dirty="dirty" @save="save" />

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-start justify-between gap-3 mb-3">
      <div class="flex items-center gap-2 text-sm text-zinc-400">
        <Database class="w-4 h-4" />Export history
      </div>
      <span v-if="stats" class="text-xs text-right text-zinc-500 tabular-nums shrink-0">
        {{ sampleCount.toLocaleString() }} readings<template v-if="spanLabel"> ~{{ spanLabel }}</template>
      </span>
    </div>
    <p class="mb-4 text-sm text-zinc-500">
      Download recorded readings as a spreadsheet (CSV) or JSON. Pick a resolution to thin long
      exports to one row per interval instead of every sample.
    </p>
    <label class="block mb-4">
      <span class="block mb-1 text-sm text-zinc-400">Resolution</span>
      <select v-model="resolution" class="w-full max-w-xs px-3 py-2 rounded-lg bg-zinc-800">
        <option v-for="option in RESOLUTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </label>
    <div class="flex flex-wrap gap-3">
      <button
        type="button"
        :disabled="exporting !== null"
        @click="downloadExport('csv')"
        class="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
      >
        <FileSpreadsheet class="w-4 h-4" />{{ exporting === 'csv' ? 'Preparing…' : 'CSV' }}
      </button>
      <button
        type="button"
        :disabled="exporting !== null"
        @click="downloadExport('json')"
        class="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
      >
        <FileJson class="w-4 h-4" />{{ exporting === 'json' ? 'Preparing…' : 'JSON' }}
      </button>
    </div>
    <p v-if="exportError" class="mt-3 text-sm text-red-400">{{ exportError }}</p>
  </section>

  <UnsavedDialog :open="pendingLeave" @confirm="confirmLeave" @cancel="cancelLeave" />
</template>
