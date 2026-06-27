<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Activity, BatteryFull, BatteryLow, LoaderCircle, Percent, ScanSearch } from '@lucide/vue'
import InfoTip from '../InfoTip.vue'
import { useSettings } from '../../composables/useSettings.js'
import { useSettingsSection } from '../../composables/useSettingsSection.js'
import { useStateStream } from '../../composables/useStateStream.js'
import { withMinDuration } from '../../lib/withMinDuration.js'
import SaveBar from './SaveBar.vue'
import UnsavedDialog from './UnsavedDialog.vue'

const { data, loadOnce } = useSettings()
const { state } = useStateStream()

const form = reactive({ capacityKwh: '', reserveSoc: 0, chargeUnit: 'percent' })

const RESERVE_MIN = 0
const RESERVE_MAX = 99

const { status, error, dirty, save, markPristine, pendingLeave, confirmLeave, cancelLeave } =
  useSettingsSection({ snapshot, buildPatch })

const detecting = ref(false)

onMounted(async () => {
  await loadOnce()
  form.capacityKwh = data.battery.capacityKwh ?? ''
  form.reserveSoc = data.battery.reserveSoc
  form.chargeUnit = data.battery.chargeUnit
  markPristine()
})

const capacity = () => (form.capacityKwh === '' || form.capacityKwh === null ? null : Number(form.capacityKwh))

const detectedCapacity = computed(() => state.ratedEnergyCapacity)

const applyDetected = async () => {
  detecting.value = true
  form.capacityKwh = await withMinDuration(Promise.resolve(detectedCapacity.value))
  detecting.value = false
}

const batterySoh = computed(() =>
  state.batterySoh !== null ? Math.round(state.batterySoh) : null
)

const hasEnergyStats = computed(() =>
  [
    batterySoh.value,
    state.lifetimePv, state.consumedToday, state.lifetimeConsumed,
    state.lifetimeGridImport, state.lifetimeGridExport,
    state.lifetimeBatteryCharge, state.lifetimeBatteryDischarge
  ].some((v) => v !== null)
)

const formatKwh = (kwh) => {
  if (kwh === null) return '—'
  if (kwh >= 1000) return `${(kwh / 1000).toFixed(2)} MWh`
  if (kwh >= 100) return `${Math.round(kwh)} kWh`
  if (kwh >= 10) return `${kwh.toFixed(1)} kWh`
  return `${kwh.toFixed(2)} kWh`
}

function snapshot() {
  return { capacityKwh: capacity(), reserveSoc: Number(form.reserveSoc), chargeUnit: form.chargeUnit }
}

function buildPatch() {
  return {
    battery: { capacityKwh: capacity(), reserveSoc: Number(form.reserveSoc), chargeUnit: form.chargeUnit }
  }
}
</script>

<template>
  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <BatteryFull class="w-4 h-4" />Usable capacity
    </div>
    <div class="flex items-stretch overflow-hidden rounded-lg bg-zinc-800 focus-within:ring-1 focus-within:ring-zinc-500">
      <input v-model="form.capacityKwh" type="number" step="any" min="0" placeholder="Leave blank if unsure"
        class="w-full px-3 py-2 bg-transparent outline-none tabular-nums" />
      <button
        v-if="detectedCapacity !== null"
        class="flex shrink-0 items-center gap-1.5 border-l border-zinc-700 bg-green-600/15 px-3 text-sm text-green-400 hover:bg-green-600/25 disabled:opacity-50"
        :disabled="detecting"
        title="Fill from gateway reading"
        @click="applyDetected"
      >
        <LoaderCircle v-if="detecting" class="w-4 h-4 animate-spin" />
        <ScanSearch v-else class="w-4 h-4" />
        {{ detecting ? 'Detecting…' : 'Detect' }}
      </button>
    </div>
    <p class="mt-2 text-xs text-zinc-500">
      Your battery's usable energy in kilowatt-hours. When set, the battery tile shows how much
      energy is left to charge or to spend down to the reserve. If the gateway reports its capacity,
      the Detect button fills this automatically.
    </p>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <Percent class="w-4 h-4" />Charge readout
    </div>
    <p class="mb-3 text-xs text-zinc-500">
      How the battery's charge appears on the dashboard tile and its fullscreen view. Energy needs a
      usable capacity above; without one it stays a percentage.
    </p>
    <select v-model="form.chargeUnit" class="w-full px-3 py-2 rounded-lg bg-zinc-800">
      <option value="percent">Percentage (%)</option>
      <option value="energy">Energy (kWh)</option>
    </select>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2 text-sm text-zinc-400">
        <BatteryLow class="w-4 h-4" />Reserve charge<InfoTip topic="reserveCharge" />
      </div>
      <span class="text-sm text-zinc-300 tabular-nums">{{ form.reserveSoc }}%</span>
    </div>
    <p class="mb-3 text-xs text-zinc-500">
      The lowest charge the system discharges to. The time estimate counts down to this floor
      instead of empty.
    </p>
    <input v-model.number="form.reserveSoc" type="range" :min="RESERVE_MIN" :max="RESERVE_MAX"
      step="1" class="w-full" />
  </section>

  <section
    v-if="hasEnergyStats"
    class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800"
  >
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <Activity class="w-4 h-4" />Energy statistics<InfoTip topic="energyStats" />
    </div>
    <dl class="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
      <template v-if="batterySoh !== null">
        <dt class="text-zinc-500">Battery health</dt>
        <dd class="tabular-nums text-right text-zinc-300">{{ batterySoh }}%</dd>
      </template>
      <template v-if="state.lifetimeBatteryCharge !== null">
        <dt class="text-zinc-500">Battery charged</dt>
        <dd class="tabular-nums text-right text-zinc-300">{{ formatKwh(state.lifetimeBatteryCharge) }}</dd>
      </template>
      <template v-if="state.lifetimeBatteryDischarge !== null">
        <dt class="text-zinc-500">Battery discharged</dt>
        <dd class="tabular-nums text-right text-zinc-300">{{ formatKwh(state.lifetimeBatteryDischarge) }}</dd>
      </template>
      <template v-if="state.lifetimePv !== null">
        <dt class="text-zinc-500">PV generated</dt>
        <dd class="tabular-nums text-right text-zinc-300">{{ formatKwh(state.lifetimePv) }}</dd>
      </template>
      <template v-if="state.lifetimeGridImport !== null">
        <dt class="text-zinc-500">Grid imported</dt>
        <dd class="tabular-nums text-right text-zinc-300">{{ formatKwh(state.lifetimeGridImport) }}</dd>
      </template>
      <template v-if="state.lifetimeGridExport !== null">
        <dt class="text-zinc-500">Grid exported</dt>
        <dd class="tabular-nums text-right text-zinc-300">{{ formatKwh(state.lifetimeGridExport) }}</dd>
      </template>
      <template v-if="state.lifetimeConsumed !== null">
        <dt class="text-zinc-500">Total consumed</dt>
        <dd class="tabular-nums text-right text-zinc-300">{{ formatKwh(state.lifetimeConsumed) }}</dd>
      </template>
      <template v-if="state.consumedToday !== null">
        <dt class="text-zinc-500">Consumed today</dt>
        <dd class="tabular-nums text-right text-zinc-300">{{ formatKwh(state.consumedToday) }}</dd>
      </template>
    </dl>
  </section>

  <SaveBar :status="status" :error="error" :dirty="dirty" @save="save" />
  <UnsavedDialog :open="pendingLeave" @confirm="confirmLeave" @cancel="cancelLeave" />
</template>
