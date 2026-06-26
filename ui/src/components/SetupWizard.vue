<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft, ArrowRight, Cable, CircleAlert, CircleCheck, Clock,
  House, KeyRound, LoaderCircle, Plus, Radar, Thermometer, X
} from '@lucide/vue'
import { useSettings } from '../composables/useSettings.js'
import { useGatewayScan } from '../composables/useGatewayScan.js'
import InfoTip from './InfoTip.vue'

const STEPS = ['Welcome', 'Gateway', 'Polling', 'Weather', 'HomeKit', 'Google Home', 'Ready']

const router = useRouter()
const { data, load, save, testGateway, testWeather, dismiss } = useSettings()

const step = ref(0)
const saving = ref(false)
const saveError = ref('')

const host = ref('')
const sigenPort = ref(502)
const unitId = ref(247)
const testing = ref(false)
const testResult = ref(null)
const { scanning, scanCandidates, scanError, scan, applyCandidate } =
  useGatewayScan({ host, port: sigenPort, unitId, testResult })

const defaultInterval = ref(5)
const schedule = ref([])

const weatherEnabled = ref(true)
const latitude = ref('')
const longitude = ref('')
const units = ref('celsius')
const weatherTesting = ref(false)
const weatherResult = ref(null)

const hkName = ref('Sigenergy')
const hkPin = ref('516-35-163')
const hkPort = ref(51826)

const googleToken = ref('')

const totalSteps = STEPS.length
const stepTitle = computed(() => STEPS[step.value])
const progress = computed(() => `${Math.round((step.value / (totalSteps - 1)) * 100)}%`)
const isLast = computed(() => step.value === totalSteps - 1)
const canAdvance = computed(() => step.value !== 1 || testResult.value?.ok === true)
const tokenPlaceholder = computed(() => (data.googleAuthTokenSet ? '••••• (stored)' : 'auth token'))

const nextLabel = computed(() => {
  if (isLast.value) return 'Go to dashboard'
  if (step.value === 0) return 'Get started'
  if (step.value === 3 && !weatherEnabled.value) return 'Skip & next'
  if (step.value === 5 && !googleToken.value.trim()) return 'Skip & next'
  return 'Save & next'
})

onMounted(async () => {
  await load()
  host.value = data.sigen.host
  sigenPort.value = data.sigen.port
  unitId.value = data.sigen.unitId
  defaultInterval.value = toSeconds(data.poll.defaultIntervalMs)
  schedule.value = data.poll.schedule.map((window) => ({ ...window }))
  weatherEnabled.value = data.weather.enabled
  latitude.value = data.weather.latitude ?? ''
  longitude.value = data.weather.longitude ?? ''
  units.value = data.weather.units
  hkName.value = data.homekit.name
  hkPin.value = data.homekit.pin
  hkPort.value = data.homekit.port
  if (!host.value) scan()
})

const test = async () => {
  testing.value = true
  testResult.value = null
  testResult.value = await testGateway({
    host: host.value.trim(),
    port: Number(sigenPort.value),
    unitId: Number(unitId.value)
  })
  testing.value = false
}

const AUTO_TEST_DELAY_MS = 600
let autoTestTimer = null
const autoTestPending = ref(false)

const scheduleAutoTest = ({ immediate = false } = {}) => {
  clearTimeout(autoTestTimer)
  autoTestPending.value = false
  if (step.value !== 1 || scanning.value || !host.value.trim()) return
  if (immediate) return test()
  autoTestPending.value = true
  autoTestTimer = setTimeout(() => {
    autoTestPending.value = false
    test()
  }, AUTO_TEST_DELAY_MS)
}

watch([host, sigenPort, unitId], () => {
  testResult.value = null
  scanCandidates.value = null
  scheduleAutoTest()
})

watch(step, () => {
  if (step.value === 1 && !testResult.value) scheduleAutoTest({ immediate: true })
})

onUnmounted(() => clearTimeout(autoTestTimer))

const runWeatherTest = async () => {
  weatherTesting.value = true
  weatherResult.value = null
  const testUnits = units.value
  const response = await testWeather({
    latitude: coord(latitude.value),
    longitude: coord(longitude.value),
    units: testUnits
  })
  weatherResult.value = { ...response, units: testUnits }
  weatherTesting.value = false
}

const weatherTestTemp = ({ temperature, units }) =>
  temperature == null ? '—' : `${Math.round(temperature)}°${units === 'fahrenheit' ? 'F' : 'C'}`

const addWindow = () => schedule.value.push({ start: '23:00', end: '08:00', intervalMs: 60000 })
const removeWindow = (index) => schedule.value.splice(index, 1)

const back = () => {
  if (step.value === 0) return
  saveError.value = ''
  step.value -= 1
}

const next = async () => {
  if (isLast.value) return finish()
  const patch = patchForStep()
  if (patch && Object.keys(patch).length && !(await persist(patch))) return
  step.value += 1
}

const finish = async () => {
  if (!(await persist({ setupComplete: true }))) return
  dismiss()
  router.push({ name: 'dashboard' })
}

const skip = () => {
  dismiss()
  router.push({ name: 'settings' })
}

const persist = async (patch) => {
  saving.value = true
  saveError.value = ''
  try {
    await save(patch)
    return true
  } catch (error) {
    saveError.value = error.message
    return false
  } finally {
    saving.value = false
  }
}

const patchForStep = () => {
  if (step.value === 1) {
    return { sigen: { host: host.value.trim(), port: Number(sigenPort.value), unitId: Number(unitId.value) } }
  }
  if (step.value === 2) {
    return { poll: { defaultIntervalMs: fromSeconds(defaultInterval.value), schedule: cleanSchedule() } }
  }
  if (step.value === 3) {
    return {
      weather: {
        enabled: weatherEnabled.value,
        latitude: coord(latitude.value),
        longitude: coord(longitude.value),
        units: units.value
      }
    }
  }
  if (step.value === 4) {
    return { homekit: { name: hkName.value.trim(), pin: hkPin.value.trim(), port: Number(hkPort.value) } }
  }
  if (step.value === 5) return googleToken.value.trim() ? { google: { authToken: googleToken.value.trim() } } : {}
  return {}
}

const cleanSchedule = () =>
  schedule.value.map(({ start, end, intervalMs }) => ({ start, end, intervalMs }))

const coord = (value) => (value === '' || value === null ? null : Number(value))
const toSeconds = (ms) => Math.round(ms / 1000)
const fromSeconds = (value) => Math.max(1, Math.floor(Number(value) || 1)) * 1000
</script>

<template>
  <main class="flex min-h-app flex-col items-center justify-center p-safe">
    <section class="w-full max-w-2xl rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
      <header class="flex items-center justify-between border-b border-zinc-800 p-5">
        <div>
          <p class="text-xs uppercase tracking-widest text-zinc-500">Step {{ step + 1 }} / {{ totalSteps }}</p>
          <h1 class="text-lg font-semibold leading-tight tracking-tight">{{ stepTitle }}</h1>
        </div>
        <button v-if="!isLast" class="text-sm text-zinc-400 hover:text-zinc-100" @click="skip">
          Skip to settings &rarr;
        </button>
      </header>

      <div class="h-1 bg-zinc-800">
        <div class="h-1 bg-green-500 transition-all" :style="{ width: progress }"></div>
      </div>

      <div class="space-y-5 p-6">
        <div v-if="step === 0" class="space-y-4">
          <p class="text-zinc-200">
            This quick setup points the bridge at your Sigenergy gateway and tunes how it polls,
            then optionally wires up weather, HomeKit, and Google Home.
          </p>
          <p class="text-sm text-zinc-400">
            Only the gateway step is required; everything else can be changed later in Settings.
            Saved values are prefilled.
          </p>
        </div>

        <div v-else-if="step === 1" class="space-y-4">
          <div class="flex items-center gap-2 text-sm text-zinc-400">
            <Cable class="h-4 w-4" />Modbus TCP gateway
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <span class="mb-1 flex items-center gap-1 text-sm text-zinc-400">
                Gateway IP / host<InfoTip topic="gatewayHost" />
              </span>
              <div class="flex items-stretch overflow-hidden rounded-lg bg-zinc-800 focus-within:ring-1 focus-within:ring-zinc-500">
                <input v-model="host" type="text" placeholder="192.168.1.50"
                  class="w-full bg-transparent px-3 py-2 outline-none" />
                <button
                  class="flex shrink-0 items-center gap-1.5 border-l border-zinc-700 bg-green-600/15 px-3 text-sm text-green-400 hover:bg-green-600/25 disabled:opacity-50"
                  :disabled="scanning || testing"
                  @click="scan"
                >
                  <LoaderCircle v-if="scanning" class="h-4 w-4 animate-spin" />
                  <Radar v-else class="h-4 w-4" />
                  {{ scanning ? 'Scanning…' : 'Scan' }}
                </button>
              </div>
            </div>
            <label class="block">
              <span class="mb-1 flex items-center gap-1 text-sm text-zinc-400">
                Port<InfoTip topic="gatewayPort" />
              </span>
              <input v-model="sigenPort" type="number"
                class="w-full rounded-lg bg-zinc-800 px-3 py-2 tabular-nums" />
            </label>
            <label class="block">
              <span class="mb-1 flex items-center gap-1 text-sm text-zinc-400">
                Unit ID<InfoTip topic="unitId" />
              </span>
              <input v-model="unitId" type="number"
                class="w-full rounded-lg bg-zinc-800 px-3 py-2 tabular-nums" />
            </label>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <button
              class="flex items-center gap-1.5 rounded-xl bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
              :disabled="testing || scanning || !host.trim()"
              @click="test"
            >
              <LoaderCircle v-if="testing" class="h-4 w-4 animate-spin" />
              {{ testing ? 'Testing…' : 'Test connection' }}
            </button>
            <span v-if="testResult?.ok" class="flex items-center gap-1 text-sm text-green-400">
              <CircleCheck class="h-4 w-4" />Reached gateway, battery {{ testResult.batterySoc }}%
            </span>
            <span v-else-if="testResult" class="flex items-center gap-1 text-sm text-red-400">
              <CircleAlert class="h-4 w-4" />{{ testResult.error }}
            </span>
          </div>
          <div v-if="scanCandidates?.length > 1" class="space-y-2">
            <p class="text-sm text-zinc-400">Multiple gateways answered; pick yours:</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="candidate in scanCandidates" :key="candidate.host"
                class="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm tabular-nums hover:bg-zinc-700"
                @click="applyCandidate(candidate)"
              >
                {{ candidate.host }}, battery {{ candidate.batterySoc }}%
              </button>
            </div>
          </div>
          <p v-else-if="scanCandidates && !scanCandidates.length" class="text-sm text-amber-400">
            No gateway answered on port {{ sigenPort }}. Check Modbus TCP is enabled in mySigen, or enter the IP manually.
          </p>
          <p v-else-if="scanError" class="text-sm text-red-400">{{ scanError }}</p>
          <p v-if="!canAdvance && !testing && !scanning && !autoTestPending" class="text-xs text-amber-400">
            <strong class="font-semibold">Scan</strong> for your gateway or enter its address, then run <strong class="font-semibold">Test connection</strong> to continue; the dashboard needs a reachable gateway.
          </p>
        </div>

        <div v-else-if="step === 2" class="space-y-4">
          <div class="flex items-center gap-2 text-sm text-zinc-400">
            <Clock class="h-4 w-4" />Poll cadence
          </div>
          <label class="block">
            <span class="mb-1 block text-sm text-zinc-400">Default interval (seconds)</span>
            <input v-model="defaultInterval" type="number" min="1"
              class="w-32 rounded-lg bg-zinc-800 px-3 py-2 tabular-nums" />
          </label>
          <div>
            <div class="mb-1 flex items-center justify-between">
              <span class="text-sm text-zinc-400">Schedule overrides</span>
              <button class="flex items-center gap-1 text-sm text-zinc-300 hover:text-white" @click="addWindow">
                <Plus class="h-4 w-4" />Add window
              </button>
            </div>
            <p v-if="!schedule.length" class="text-xs text-zinc-500">
              No overrides; the default applies all day.
            </p>
            <div v-for="(win, index) in schedule" :key="index" class="mb-2 flex items-center gap-2">
              <input v-model="win.start" type="time" class="rounded-lg bg-zinc-800 px-2 py-2" />
              <span class="text-zinc-600">&rarr;</span>
              <input v-model="win.end" type="time" class="rounded-lg bg-zinc-800 px-2 py-2" />
              <span class="text-zinc-600">@</span>
              <input
                :value="toSeconds(win.intervalMs)" type="number" min="1"
                class="w-20 rounded-lg bg-zinc-800 px-3 py-2 tabular-nums"
                @input="win.intervalMs = fromSeconds($event.target.value)"
              />
              <span class="text-sm text-zinc-500">s</span>
              <button class="ml-auto text-zinc-500 hover:text-red-400" aria-label="Remove window" @click="removeWindow(index)">
                <X class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div v-else-if="step === 3" class="space-y-4">
          <div class="flex items-center gap-2 text-sm text-zinc-400">
            <Thermometer class="h-4 w-4" />Outdoor temperature
          </div>
          <label class="flex items-center gap-2 text-sm text-zinc-300">
            <input v-model="weatherEnabled" type="checkbox" class="h-4 w-4" />
            Show the local temperature in the dashboard header
          </label>
          <template v-if="weatherEnabled">
            <p class="text-xs text-zinc-500">
              Leave coordinates blank to auto-detect from the server's IP, or set them to pin an exact location.
            </p>
            <div class="grid gap-4 sm:grid-cols-3">
              <label class="block">
                <span class="mb-1 flex items-center gap-1 text-sm text-zinc-400">
                  Latitude<InfoTip topic="coordinates" />
                </span>
                <input v-model="latitude" type="number" step="any" placeholder="auto"
                  class="w-full rounded-lg bg-zinc-800 px-3 py-2 tabular-nums" />
              </label>
              <label class="block">
                <span class="mb-1 block text-sm text-zinc-400">Longitude</span>
                <input v-model="longitude" type="number" step="any" placeholder="auto"
                  class="w-full rounded-lg bg-zinc-800 px-3 py-2 tabular-nums" />
              </label>
              <label class="block">
                <span class="mb-1 block text-sm text-zinc-400">Units</span>
                <select v-model="units" class="w-full rounded-lg bg-zinc-800 px-3 py-2">
                  <option value="celsius">Celsius</option>
                  <option value="fahrenheit">Fahrenheit</option>
                </select>
              </label>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button
                class="flex items-center gap-1.5 rounded-xl bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
                :disabled="weatherTesting"
                @click="runWeatherTest"
              >
                <LoaderCircle v-if="weatherTesting" class="h-4 w-4 animate-spin" />
                {{ weatherTesting ? 'Testing…' : 'Test' }}
              </button>
              <span v-if="weatherResult?.ok" class="flex items-center gap-1 text-sm text-green-400">
                <CircleCheck class="h-4 w-4" />{{ weatherTestTemp(weatherResult) }} at {{ weatherResult.location }}
              </span>
              <span v-else-if="weatherResult" class="flex items-center gap-1 text-sm text-red-400">
                <CircleAlert class="h-4 w-4" />{{ weatherResult.error }}
              </span>
            </div>
          </template>
        </div>

        <div v-else-if="step === 4" class="space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-sm text-zinc-400">
              <House class="h-4 w-4" />Apple HomeKit
            </div>
            <span class="flex items-center gap-1.5">
              <span class="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">Requires restart</span>
              <InfoTip topic="restartHomekit" align="right" />
            </span>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block sm:col-span-2">
              <span class="mb-1 block text-sm text-zinc-400">Bridge name</span>
              <input v-model="hkName" type="text" class="w-full rounded-lg bg-zinc-800 px-3 py-2" />
            </label>
            <label class="block">
              <span class="mb-1 flex items-center gap-1 text-sm text-zinc-400">
                Pairing PIN<InfoTip topic="homekitPin" />
              </span>
              <input v-model="hkPin" type="text" placeholder="516-35-163"
                class="w-full rounded-lg bg-zinc-800 px-3 py-2 tabular-nums" />
            </label>
            <label class="block">
              <span class="mb-1 flex items-center gap-1 text-sm text-zinc-400">
                HAP port<InfoTip topic="homekitPort" />
              </span>
              <input v-model="hkPort" type="number"
                class="w-full rounded-lg bg-zinc-800 px-3 py-2 tabular-nums" />
            </label>
          </div>
          <p class="text-xs text-zinc-500">
            Changing the PIN or port needs a restart and re-pairing in the Home app.
          </p>
        </div>

        <div v-else-if="step === 5" class="space-y-4">
          <div class="flex items-center gap-2 text-sm text-zinc-400">
            <KeyRound class="h-4 w-4" />Google Home (optional)
          </div>
          <p class="text-xs text-zinc-500">
            Static bearer token for the stub OAuth used by Google Smart Home fulfillment.
            Leave blank to keep the current value.
          </p>
          <label class="block">
            <span class="mb-1 flex items-center gap-1 text-sm text-zinc-400">
              Auth token<InfoTip topic="googleToken" />
            </span>
            <input v-model="googleToken" type="password" autocomplete="off" :placeholder="tokenPlaceholder"
              class="w-full rounded-lg bg-zinc-800 px-3 py-2" />
          </label>
        </div>

        <div v-else class="space-y-3 text-center">
          <CircleCheck class="mx-auto h-10 w-10 text-green-400" />
          <p class="text-zinc-200">You're set.</p>
          <p class="text-sm text-zinc-400 text-balance">
            The dashboard shows live values as soon as the gateway responds. Re-run this any time from Settings.
          </p>
        </div>
      </div>

      <footer class="flex items-center justify-between gap-8 border-t border-zinc-800 p-5">
        <button
          v-if="step > 0"
          class="flex items-center gap-1 text-zinc-400 hover:text-zinc-100 disabled:opacity-40"
          :disabled="saving"
          @click="back"
        >
          <ArrowLeft class="h-4 w-4" />Back
        </button>
        <span v-else></span>
        <div class="flex items-center gap-3 tracking-tight">
          <span v-if="saveError" class="text-sm text-red-400">{{ saveError }}</span>
          <button
            class="flex items-center gap-1 rounded-xl bg-green-600 px-4 py-2 font-medium hover:bg-green-500 disabled:opacity-50"
            :disabled="!canAdvance || saving"
            @click="next"
          >
            <LoaderCircle v-if="saving" class="h-4 w-4 animate-spin" />
            {{ saving ? 'Saving…' : nextLabel }}<ArrowRight v-if="!isLast && !saving" class="h-4 w-4" />
          </button>
        </div>
      </footer>
    </section>
  </main>
</template>
