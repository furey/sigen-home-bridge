<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import {
  Cloud, ExternalLink, Gauge, LoaderCircle, RefreshCw, Tag, TriangleAlert
} from '@lucide/vue'
import { useSettings } from '../../composables/useSettings.js'
import { useSettingsSection } from '../../composables/useSettingsSection.js'
import { googleStatusLines, googleTokenProblem } from '../../lib/googleToken.js'
import { withMinDuration } from '../../lib/withMinDuration.js'
import InfoTip from '../InfoTip.vue'
import GoogleTokenInput from './GoogleTokenInput.vue'
import HowTo from './HowTo.vue'
import SaveBar from './SaveBar.vue'
import UnsavedDialog from './UnsavedDialog.vue'

const REPO_URL = 'https://github.com/furey/sigen-home-bridge'
const DEEP_DIVE_URL = `${REPO_URL}/blob/main/docs/DEEP_DIVE.md`

const { data, loadOnce, reload } = useSettings()

const googleToken = ref('')
const refreshing = ref(false)
const refreshError = ref('')
const now = ref(Date.now())
let clock = null
const powerUnit = ref('watts')
const batteryDisplay = ref('tile')
const labels = reactive({})

const CLOCK_TICK_MS = 15000

const SIGN_NOTES = {
  gridPower: 'positive import, negative export',
  batteryPower: 'positive charge, negative discharge'
}

const { status, error, dirty, save, markPristine, pendingLeave, confirmLeave, cancelLeave } =
  useSettingsSection({ snapshot, buildPatch, onSaved })

const statusLines = computed(() => googleStatusLines(data.googleStatus, now.value))

const STATUS_TONES = {
  none: 'text-zinc-500',
  accepted: 'text-green-400',
  rejected: 'text-amber-300'
}

onMounted(async () => {
  clock = setInterval(() => { now.value = Date.now() }, CLOCK_TICK_MS)
  await loadOnce()
  syncFromData()
  markPristine()
})

onUnmounted(() => clearInterval(clock))

function onSaved() {
  googleToken.value = ''
  syncFromData()
}

function onSave() {
  const problem = googleTokenProblem(googleToken.value)
  if (!problem) return save()
  error.value = problem
  status.value = 'error'
}

async function refreshStatus() {
  refreshing.value = true
  refreshError.value = ''
  try {
    await withMinDuration(reload())
    now.value = Date.now()
  } catch (reloadError) {
    refreshError.value = reloadError.message
  } finally {
    refreshing.value = false
  }
}

function syncFromData() {
  powerUnit.value = data.google?.powerUnit ?? 'watts'
  batteryDisplay.value = data.google?.batteryDisplay ?? 'tile'
  for (const metric of data.googleMetrics) {
    labels[metric.key] = data.google?.labels?.[metric.key] ?? metric.defaultName
  }
}

function appearsAs(metric) {
  if (metric.key === 'batterySoc') {
    return batteryDisplay.value === 'reading'
      ? 'Temperature tile, % as a number (spoken by voice)'
      : 'Battery tile, charge % and charging state'
  }
  if (powerUnit.value === 'hidden') return 'Hidden (no tile; value via API and voice)'
  const unit = powerUnit.value === 'kilowatts' ? 'kW' : 'W'
  const note = SIGN_NOTES[metric.key]
  return note ? `Temperature tile, ${unit} (${note})` : `Temperature tile, ${unit}`
}

function snapshot() {
  return {
    googleToken: googleToken.value.trim(),
    powerUnit: powerUnit.value,
    batteryDisplay: batteryDisplay.value,
    labels: { ...labels }
  }
}

function buildPatch() {
  const token = googleToken.value.trim()
  const google = {
    powerUnit: powerUnit.value,
    batteryDisplay: batteryDisplay.value,
    labels: { ...labels }
  }
  if (token) google.authToken = token
  return { google }
}
</script>

<template>
  <HowTo title="How to connect Google Home">
    <div class="p-3 space-y-1 rounded-lg bg-amber-500/5 ring-1 ring-amber-500/20">
      <p class="flex items-center gap-1.5 text-xs font-medium text-amber-300">
        <TriangleAlert class="w-3.5 h-3.5" />Limited support
      </p>
      <p class="text-xs text-zinc-400">
        Google has deprecated self-hosted integrations, so it renders the readings less cleanly than Apple Home:
        the battery shows a proper tile, but the power metrics arrive as temperature tiles labelled in degrees
        (the number is your live watts). If you only use Apple Home or the dashboard, skip all of this; no tunnel
        is needed.
      </p>
    </div>
    <ol class="ml-4 space-y-1 list-decimal">
      <li>
        Create a free Cloudflare Tunnel routing a hostname to <span class="text-zinc-200">http://localhost:5163</span>,
        put its token in <span class="text-zinc-200">CLOUDFLARE_TUNNEL_TOKEN</span>, and start the sidecar with
        <span class="text-zinc-200">docker compose --profile tunnel up -d</span>.
      </li>
      <li>
        In the Google Home Developer Console, create a cloud-to-cloud project. Set the fulfillment URL to
        <span class="text-zinc-200">https://&lt;your-tunnel-host&gt;/fulfillment</span> and the OAuth Authorization
        and Token URLs to <span class="text-zinc-200">/auth</span> and <span class="text-zinc-200">/token</span> on
        the same host. Client ID can be any non-empty value; Client secret must match the Auth token above.
      </li>
      <li>
        Press Generate beside the Auth token above. It fills in a random token and copies it.
        Paste the same value into Client secret in the Developer Console, then Save here.
        Google sends it as the bearer and the OAuth client secret, so treat it as a secret.
      </li>
      <li>
        Link the project in the Google Home app. The battery appears as a battery tile; solar, grid, home, and
        battery power appear as temperature tiles reading watts.
      </li>
      <li>
        Check the status line under the Auth token. Last accepted confirms the link: Google
        sent the right token or client secret.
      </li>
    </ol>
    <a :href="`${DEEP_DIVE_URL}#google-home-fulfillment`" target="_blank" rel="noopener"
      class="inline-flex items-center gap-1 text-zinc-300 hover:text-zinc-100">
      Google Home fulfillment (<span class="font-mono">DEEP_DIVE.md</span>)<ExternalLink class="w-3.5 h-3.5" />
    </a>
  </HowTo>

  <section class="p-5 rounded-2xl phone-bleed bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <Cloud class="w-4 h-4" />Google Home
    </div>
    <div class="block">
      <div class="flex items-center gap-1 mb-1 text-sm text-zinc-400">
        <label for="google-auth-token">Auth token</label><InfoTip topic="googleToken" />
      </div>
      <GoogleTokenInput v-model="googleToken"
        :placeholder="data.googleAuthTokenSet ? '••••• (stored)' : 'auth token'" />
      <span class="block mt-1 text-xs text-zinc-500 text-pretty">
        Leave blank to keep the stored token.
      </span>
    </div>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3">
      <button type="button"
        class="flex shrink-0 items-center gap-1.5 rounded-xl bg-zinc-800 px-3 py-1.5 text-sm
          hover:bg-zinc-700 disabled:opacity-50"
        :disabled="refreshing" @click="refreshStatus">
        <LoaderCircle v-if="refreshing" class="w-4 h-4 animate-spin" />
        <RefreshCw v-else class="w-4 h-4" />{{ refreshing ? 'Checking…' : 'Check Google connection' }}
      </button>
      <div class="min-w-0 flex-1 basis-56 space-y-0.5">
        <p v-for="line in statusLines" :key="line.text" class="text-sm text-pretty"
          :class="STATUS_TONES[line.tone]">
          {{ line.text }}
        </p>
        <p v-if="refreshError" class="text-sm text-red-400 text-pretty">{{ refreshError }}</p>
      </div>
    </div>
  </section>

  <section class="p-5 rounded-2xl phone-bleed bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <Gauge class="w-4 h-4" />Display
    </div>
    <div class="space-y-4">
      <label class="block">
        <span class="block mb-1 text-sm text-zinc-400">Battery</span>
        <select v-model="batteryDisplay" class="w-full px-3 py-2 rounded-lg bg-zinc-800">
          <option value="tile">Battery tile (charge level, voice says a word)</option>
          <option value="reading">Percentage reading (voice says the number, no tile)</option>
        </select>
      </label>
      <label class="block">
        <span class="block mb-1 text-sm text-zinc-400">Power metrics</span>
        <select v-model="powerUnit" class="w-full px-3 py-2 rounded-lg bg-zinc-800">
          <option value="watts">Watts (e.g. 285°, full detail)</option>
          <option value="kilowatts">Kilowatts (e.g. 5°, rounds off sub-kW flows)</option>
          <option value="hidden">Hidden (no temperature tiles)</option>
        </select>
        <span class="block mt-1 text-xs text-zinc-500">
          Solar, grid, home, and battery power. Google has no watt unit, so the readings ride on temperature
          tiles labelled in degrees unless hidden.
        </span>
      </label>
    </div>
    <div class="p-3 mt-4 space-y-1 rounded-lg bg-amber-500/5 ring-1 ring-amber-500/20">
      <p class="flex items-center gap-1.5 text-xs font-medium text-amber-300">
        <TriangleAlert class="w-3.5 h-3.5" />Changing these needs a re-sync
      </p>
      <p class="text-xs text-zinc-400">
        These change each device's type, so save here, then relink the integration in the Google Home app to
        pick them up.
      </p>
    </div>
  </section>

  <section class="p-5 rounded-2xl phone-bleed bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <Tag class="w-4 h-4" />Google Home naming
    </div>
    <p class="mb-3 text-sm text-zinc-500">
      Rename each reading as it appears in Google Home. Leave a field blank to use its default name.
    </p>
    <div class="space-y-3">
      <label v-for="metric in data.googleMetrics" :key="metric.key" class="block">
        <span class="block mb-1 text-sm text-zinc-400">{{ metric.defaultName }}</span>
        <input v-model="labels[metric.key]" type="text" :placeholder="metric.defaultName"
          class="w-full px-3 py-2 rounded-lg bg-zinc-800" />
        <span class="block mt-1 text-xs text-zinc-500">{{ appearsAs(metric) }}</span>
      </label>
    </div>
    <div class="p-3 mt-4 space-y-1 rounded-lg bg-amber-500/5 ring-1 ring-amber-500/20">
      <p class="flex items-center gap-1.5 text-xs font-medium text-amber-300">
        <TriangleAlert class="w-3.5 h-3.5" />Renaming needs a re-sync
      </p>
      <p class="text-xs text-zinc-400">
        New names apply the moment you save, but Google Home keeps the names from its last sync. To pick them up,
        relink the integration in the Google Home app, or say "Hey Google, sync my devices".
      </p>
    </div>
  </section>

  <SaveBar :status="status" :error="error" :dirty="dirty" @save="onSave">
    <template #hint>
      <span class="text-xs text-right text-zinc-600 text-balance">
        A new token must also go in the Client secret field of your Google Home Developer
        Console project. Then relink Sigen Home Bridge in the Google Home app.
      </span>
    </template>
  </SaveBar>
  <UnsavedDialog :open="pendingLeave" @confirm="confirmLeave" @cancel="cancelLeave" />
</template>
