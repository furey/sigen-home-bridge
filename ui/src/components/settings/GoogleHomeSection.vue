<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Cloud, ExternalLink, Gauge, Tag, TriangleAlert } from '@lucide/vue'
import { useSettings } from '../../composables/useSettings.js'
import { useSettingsSection } from '../../composables/useSettingsSection.js'
import InfoTip from '../InfoTip.vue'
import HowTo from './HowTo.vue'
import SaveBar from './SaveBar.vue'
import UnsavedDialog from './UnsavedDialog.vue'

const REPO_URL = 'https://github.com/furey/sigen-home-bridge'
const DEEP_DIVE_URL = `${REPO_URL}/blob/main/docs/DEEP_DIVE.md`

const { data, loadOnce } = useSettings()

const googleToken = ref('')
const powerUnit = ref('watts')
const batteryDisplay = ref('tile')
const labels = reactive({})

const SIGN_NOTES = {
  gridPower: 'positive import, negative export',
  batteryPower: 'positive charge, negative discharge'
}

const { status, error, dirty, save, markPristine, pendingLeave, confirmLeave, cancelLeave } =
  useSettingsSection({ snapshot, buildPatch, onSaved })

onMounted(async () => {
  await loadOnce()
  syncFromData()
  markPristine()
})

function onSaved() {
  googleToken.value = ''
  syncFromData()
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
        the same host. Client ID and secret can be any non-empty values.
      </li>
      <li>Set the Auth token above to any value. It's the shared bearer the stub OAuth hands back; treat it as a secret.</li>
      <li>
        Link the project in the Google Home app. The battery appears as a battery tile; solar, grid, home, and
        battery power appear as temperature tiles reading watts.
      </li>
    </ol>
    <a :href="`${DEEP_DIVE_URL}#google-home-fulfillment`" target="_blank" rel="noopener"
      class="inline-flex items-center gap-1 text-zinc-300 hover:text-zinc-100">
      Google Home fulfillment (<span class="font-mono">DEEP_DIVE.md</span>)<ExternalLink class="w-3.5 h-3.5" />
    </a>
  </HowTo>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <Cloud class="w-4 h-4" />Google Home
    </div>
    <label class="block">
      <span class="flex items-center gap-1 mb-1 text-sm text-zinc-400">
        Auth token<InfoTip topic="googleToken" />
      </span>
      <input v-model="googleToken" type="password" autocomplete="off"
        :placeholder="data.googleAuthTokenSet ? '••••• (stored)' : 'auth token'"
        class="w-full px-3 py-2 rounded-lg bg-zinc-800" />
      <span class="block mt-1 text-xs text-zinc-500">Leave blank to keep the stored token.</span>
    </label>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
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

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
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

  <SaveBar :status="status" :error="error" :dirty="dirty" @save="save">
    <template #hint>
      <span class="text-xs text-right text-zinc-600 text-balance">
        The token applies the moment you save; no restart needed.
      </span>
    </template>
  </SaveBar>
  <UnsavedDialog :open="pendingLeave" @confirm="confirmLeave" @cancel="cancelLeave" />
</template>
