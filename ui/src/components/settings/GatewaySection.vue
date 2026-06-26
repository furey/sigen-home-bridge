<script setup>
import { onMounted, ref } from 'vue'
import {
  Cable, CircleAlert, CircleCheck, Clock, LoaderCircle, Plus, Radar, X
} from '@lucide/vue'
import { useSettings } from '../../composables/useSettings.js'
import { useSettingsSection } from '../../composables/useSettingsSection.js'
import { useGatewayScan } from '../../composables/useGatewayScan.js'
import InfoTip from '../InfoTip.vue'
import SaveBar from './SaveBar.vue'
import UnsavedDialog from './UnsavedDialog.vue'

const { data, loadOnce, testGateway } = useSettings()

const host = ref('')
const sigenPort = ref(502)
const unitId = ref(247)
const defaultInterval = ref(5)
const schedule = ref([])

const testing = ref(false)
const testResult = ref(null)
const { scanning, scanCandidates, scanError, scan, applyCandidate } =
  useGatewayScan({ host, port: sigenPort, unitId, testResult })

const { status, error, dirty, save, markPristine, pendingLeave, confirmLeave, cancelLeave } =
  useSettingsSection({ snapshot, buildPatch })

onMounted(async () => {
  await loadOnce()
  host.value = data.sigen.host
  sigenPort.value = data.sigen.port
  unitId.value = data.sigen.unitId
  defaultInterval.value = toSeconds(data.poll.defaultIntervalMs)
  schedule.value = data.poll.schedule.map((window) => ({ ...window }))
  markPristine()
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

const addWindow = () => schedule.value.push({ start: '23:00', end: '08:00', intervalMs: 60000 })
const removeWindow = (index) => schedule.value.splice(index, 1)

function snapshot() {
  return {
    host: host.value.trim(),
    port: Number(sigenPort.value),
    unitId: Number(unitId.value),
    defaultIntervalMs: fromSeconds(defaultInterval.value),
    schedule: cleanSchedule()
  }
}

function buildPatch() {
  return {
    sigen: { host: host.value.trim(), port: Number(sigenPort.value), unitId: Number(unitId.value) },
    poll: { defaultIntervalMs: fromSeconds(defaultInterval.value), schedule: cleanSchedule() }
  }
}

const cleanSchedule = () =>
  schedule.value.map(({ start, end, intervalMs }) => ({ start, end, intervalMs }))

const toSeconds = (ms) => Math.round(ms / 1000)
const fromSeconds = (value) => Math.max(1, Math.floor(Number(value) || 1)) * 1000
</script>

<template>
  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <Cable class="w-4 h-4" />Gateway
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="sm:col-span-2">
        <span class="flex items-center gap-1 mb-1 text-sm text-zinc-400">
          Gateway IP / host<InfoTip topic="gatewayHost" />
        </span>
        <div class="flex items-stretch overflow-hidden rounded-lg bg-zinc-800 focus-within:ring-1 focus-within:ring-zinc-500">
          <input v-model="host" type="text" placeholder="192.168.1.50"
            class="w-full px-3 py-2 bg-transparent outline-none" />
          <button
            class="flex shrink-0 items-center gap-1.5 border-l border-zinc-700 bg-green-600/15 px-3 text-sm text-green-400 hover:bg-green-600/25 disabled:opacity-50"
            :disabled="scanning || testing"
            @click="scan"
          >
            <LoaderCircle v-if="scanning" class="w-4 h-4 animate-spin" />
            <Radar v-else class="w-4 h-4" />
            {{ scanning ? 'Scanning…' : 'Scan' }}
          </button>
        </div>
      </div>
      <label class="block">
        <span class="flex items-center gap-1 mb-1 text-sm text-zinc-400">
          Port<InfoTip topic="gatewayPort" />
        </span>
        <input v-model="sigenPort" type="number"
          class="w-full px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
      </label>
      <label class="block">
        <span class="flex items-center gap-1 mb-1 text-sm text-zinc-400">
          Unit ID<InfoTip topic="unitId" />
        </span>
        <input v-model="unitId" type="number"
          class="w-full px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
      </label>
    </div>
    <div class="flex flex-wrap items-center gap-3 mt-3">
      <button
        class="flex items-center gap-1.5 rounded-xl bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
        :disabled="testing || scanning || !host.trim()"
        @click="test"
      >
        <LoaderCircle v-if="testing" class="w-4 h-4 animate-spin" />
        {{ testing ? 'Testing…' : 'Test connection' }}
      </button>
      <span v-if="testResult?.ok" class="flex items-center gap-1 text-sm text-green-400">
        <CircleCheck class="w-4 h-4" />Reached gateway, battery {{ testResult.batterySoc }}%
      </span>
      <span v-else-if="testResult" class="flex items-center gap-1 text-sm text-red-400">
        <CircleAlert class="w-4 h-4" />{{ testResult.error }}
      </span>
    </div>
    <div v-if="scanCandidates?.length > 1" class="mt-3 space-y-2">
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
    <p v-else-if="scanCandidates && !scanCandidates.length" class="mt-3 text-sm text-amber-400">
      No gateway answered on port {{ sigenPort }}. Check Modbus TCP is enabled in mySigen, or enter the IP manually.
    </p>
    <p v-else-if="scanError" class="mt-3 text-sm text-red-400">{{ scanError }}</p>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <Clock class="w-4 h-4" />Polling
    </div>
    <label class="block">
      <span class="block mb-1 text-sm text-zinc-400">Default interval (seconds)</span>
      <input v-model="defaultInterval" type="number" min="1"
        class="w-32 px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
    </label>
    <div class="mt-4">
      <div class="flex items-center justify-between mb-1">
        <span class="text-sm text-zinc-400">Schedule overrides</span>
        <button class="flex items-center gap-1 text-sm text-zinc-300 hover:text-white" @click="addWindow">
          <Plus class="w-4 h-4" />Add window
        </button>
      </div>
      <p v-if="!schedule.length" class="text-xs text-zinc-500">
        No overrides; the default applies all day.
      </p>
      <div v-for="(win, index) in schedule" :key="index" class="flex items-center gap-2 mb-2">
        <input v-model="win.start" type="time" class="px-2 py-2 rounded-lg bg-zinc-800" />
        <span class="text-zinc-600">&rarr;</span>
        <input v-model="win.end" type="time" class="px-2 py-2 rounded-lg bg-zinc-800" />
        <span class="text-zinc-600">@</span>
        <input
          :value="toSeconds(win.intervalMs)" type="number" min="1"
          class="w-20 px-3 py-2 rounded-lg bg-zinc-800 tabular-nums"
          @input="win.intervalMs = fromSeconds($event.target.value)"
        />
        <span class="text-sm text-zinc-500">s</span>
        <button class="ml-auto text-zinc-500 hover:text-red-400" aria-label="Remove window" @click="removeWindow(index)">
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>
  </section>

  <SaveBar :status="status" :error="error" :dirty="dirty" @save="save" />
  <UnsavedDialog :open="pendingLeave" @confirm="confirmLeave" @cancel="cancelLeave" />
</template>
