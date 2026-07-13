<script setup>
import { computed, onMounted, ref } from 'vue'
import { Cpu, Sun } from '@lucide/vue'
import { useSettings } from '../../composables/useSettings.js'
import { useSettingsSection } from '../../composables/useSettingsSection.js'
import { useStateStream } from '../../composables/useStateStream.js'
import InfoTip from '../InfoTip.vue'
import SaveBar from './SaveBar.vue'
import UnsavedDialog from './UnsavedDialog.vue'

const { data, loadOnce } = useSettings()
const { state } = useStateStream()

const stringNames = ref({})

const detectedInverters = computed(() =>
  state.devices.filter((device) => device.type === 'inverter' && device.strings.length))

const { status, error, dirty, save, markPristine, pendingLeave, confirmLeave, cancelLeave } =
  useSettingsSection({ snapshot, buildPatch })

onMounted(async () => {
  await loadOnce()
  stringNames.value = cloneNames(data.solar.stringNames)
  markPristine()
})

const inverterKey = ({ serial, unitId }) => serial || `unit-${unitId}`

const nameFor = (inverter, index) => stringNames.value[inverterKey(inverter)]?.[index] ?? ''

const setName = (inverter, index, value) => {
  const key = inverterKey(inverter)
  if (!stringNames.value[key]) stringNames.value[key] = {}
  stringNames.value[key][index] = value
}

function snapshot() {
  return prune(trimmedNames())
}

function buildPatch() {
  return { solar: { stringNames: trimmedNames() } }
}

function trimmedNames() {
  return Object.fromEntries(
    Object.entries(stringNames.value).map(([key, group]) => [
      key,
      Object.fromEntries(Object.entries(group).map(([index, name]) => [index, (name ?? '').trim()]))
    ]))
}

function prune(names) {
  return Object.fromEntries(
    Object.entries(names)
      .map(([key, group]) => [key, Object.fromEntries(Object.entries(group).filter(([, name]) => name))])
      .filter(([, group]) => Object.keys(group).length))
}

function cloneNames(names) {
  return Object.fromEntries(Object.entries(names ?? {}).map(([key, group]) => [key, { ...group }]))
}
</script>

<template>
  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center justify-between mb-1">
      <div class="flex items-center gap-2 text-sm text-zinc-400">
        <Sun class="w-4 h-4" />Solar string names
      </div>
      <InfoTip topic="solarStringNames" align="right" />
    </div>
    <template v-if="detectedInverters.length">
      <p class="mb-4 text-xs text-zinc-500 !text-pretty">
        Name each PV string on your inverter. Applies live on every connected device; no restart
        needed. Names are kept per inverter, so strings on different inverters stay separate.
      </p>
      <div class="space-y-5">
        <div v-for="inverter in detectedInverters" :key="inverter.unitId">
          <div class="flex items-center gap-2 mb-2 text-xs text-zinc-500">
            <Cpu class="w-3.5 h-3.5 shrink-0" />
            <span class="truncate">{{ inverter.model }}</span>
            <span class="truncate text-zinc-600">· {{ inverter.serial }}</span>
          </div>
          <div class="space-y-3">
            <label v-for="string in inverter.strings" :key="string.index" class="block">
              <span class="block mb-1 text-sm text-zinc-400">String {{ string.index }}</span>
              <input
                :value="nameFor(inverter, string.index)"
                type="text"
                :placeholder="`String ${string.index}`"
                class="w-full px-3 py-2 rounded-lg bg-zinc-800"
                @input="setName(inverter, string.index, $event.target.value)"
              />
            </label>
          </div>
        </div>
      </div>
    </template>
    <p v-else class="text-xs text-zinc-500 !text-pretty">
      No PV strings detected. Strings appear here once the bridge discovers an inverter reporting
      one or more solar inputs on the gateway.
    </p>
  </section>

  <SaveBar :status="status" :error="error" :dirty="dirty" @save="save" />
  <UnsavedDialog :open="pendingLeave" @confirm="confirmLeave" @cancel="cancelLeave" />
</template>
