<script setup>
import { onMounted, reactive, ref } from 'vue'
import { CircleAlert, CircleCheck, LoaderCircle, Thermometer } from '@lucide/vue'
import { useSettings } from '../../composables/useSettings.js'
import { useSettingsSection } from '../../composables/useSettingsSection.js'
import InfoTip from '../InfoTip.vue'
import SaveBar from './SaveBar.vue'
import UnsavedDialog from './UnsavedDialog.vue'

const { data, loadOnce, testWeather } = useSettings()

const form = reactive({
  enabled: true,
  latitude: '',
  longitude: '',
  units: 'celsius'
})

const testing = ref(false)
const result = ref(null)

const { status, error, dirty, save, markPristine, pendingLeave, confirmLeave, cancelLeave } =
  useSettingsSection({ snapshot, buildPatch })

onMounted(async () => {
  await loadOnce()
  form.enabled = data.weather.enabled
  form.latitude = data.weather.latitude ?? ''
  form.longitude = data.weather.longitude ?? ''
  form.units = data.weather.units
  markPristine()
})

const runTest = async () => {
  testing.value = true
  result.value = null
  const units = form.units
  const response = await testWeather({ latitude: coord(form.latitude), longitude: coord(form.longitude), units })
  result.value = { ...response, units }
  testing.value = false
}

const testTemp = ({ temperature, units }) =>
  temperature == null ? '—' : `${Math.round(temperature)}°${units === 'fahrenheit' ? 'F' : 'C'}`

function snapshot() {
  return {
    enabled: form.enabled,
    latitude: coord(form.latitude),
    longitude: coord(form.longitude),
    units: form.units
  }
}

function buildPatch() {
  return {
    weather: {
      enabled: form.enabled,
      latitude: coord(form.latitude),
      longitude: coord(form.longitude),
      units: form.units
    }
  }
}

const coord = (value) => (value === '' || value === null ? null : Number(value))
</script>

<template>
  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <Thermometer class="w-4 h-4" />Weather
    </div>
    <label class="flex items-center gap-2 text-sm text-zinc-300">
      <input v-model="form.enabled" type="checkbox" class="w-4 h-4" />
      Show the local temperature in the dashboard header
    </label>
    <template v-if="form.enabled">
      <p class="mt-3 text-xs text-zinc-500">
        Leave coordinates blank to auto-detect from the server's IP, or set them to pin an exact location.
      </p>
      <div class="grid gap-4 mt-2 sm:grid-cols-3">
        <label class="block">
          <span class="flex items-center gap-1 mb-1 text-sm text-zinc-400">
            Latitude<InfoTip topic="coordinates" />
          </span>
          <input v-model="form.latitude" type="number" step="any" placeholder="auto"
            class="w-full px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
        </label>
        <label class="block">
          <span class="block mb-1 text-sm text-zinc-400">Longitude</span>
          <input v-model="form.longitude" type="number" step="any" placeholder="auto"
            class="w-full px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
        </label>
        <label class="block">
          <span class="block mb-1 text-sm text-zinc-400">Units</span>
          <select v-model="form.units" class="w-full px-3 py-2 rounded-lg bg-zinc-800">
            <option value="celsius">Celsius</option>
            <option value="fahrenheit">Fahrenheit</option>
          </select>
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-3 mt-3">
        <button
          class="flex items-center gap-1.5 rounded-xl bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
          :disabled="testing"
          @click="runTest"
        >
          <LoaderCircle v-if="testing" class="w-4 h-4 animate-spin" />
          {{ testing ? 'Testing…' : 'Test' }}
        </button>
        <span v-if="result?.ok" class="flex items-center gap-1 text-sm text-green-400">
          <CircleCheck class="w-4 h-4" />{{ testTemp(result) }} at {{ result.location }}
        </span>
        <span v-else-if="result" class="flex items-center gap-1 text-sm text-red-400">
          <CircleAlert class="w-4 h-4" />{{ result.error }}
        </span>
      </div>
    </template>
  </section>

  <SaveBar :status="status" :error="error" :dirty="dirty" @save="save" />
  <UnsavedDialog :open="pendingLeave" @confirm="confirmLeave" @cancel="cancelLeave" />
</template>
