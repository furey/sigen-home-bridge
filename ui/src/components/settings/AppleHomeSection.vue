<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ExternalLink, Gauge, House, Network, Tag, TriangleAlert } from '@lucide/vue'
import { useSettings } from '../../composables/useSettings.js'
import { useSettingsSection } from '../../composables/useSettingsSection.js'
import InfoTip from '../InfoTip.vue'
import HowTo from './HowTo.vue'
import HomekitPairing from './HomekitPairing.vue'
import SaveBar from './SaveBar.vue'
import UnsavedDialog from './UnsavedDialog.vue'

const REPO_URL = 'https://github.com/furey/sigen-home-bridge'

const { data, loadOnce } = useSettings()

const hkName = ref('Sigenergy')
const hkPin = ref('516-35-163')
const hkPort = ref(51826)
const hkManufacturer = ref('Sigenergy')
const hkModel = ref('Sigen Home Bridge')
const hkPowerUnit = ref('kilowatts')
const hkBind = ref('')
const labels = reactive({})

const SIGN_NOTES = {
  gridPower: 'positive import, negative export',
  batteryPower: 'positive charge, negative discharge'
}

const { status, error, dirty, save, markPristine, pendingLeave, confirmLeave, cancelLeave } =
  useSettingsSection({ snapshot, buildPatch, onSaved })

onMounted(async () => {
  await loadOnce()
  hkName.value = data.homekit.name
  hkPin.value = data.homekit.pin
  hkPort.value = data.homekit.port
  hkManufacturer.value = data.homekit.manufacturer
  hkModel.value = data.homekit.model
  hkPowerUnit.value = data.homekit.powerUnit
  hkBind.value = data.homekit.bind ?? ''
  syncLabels()
  markPristine()
})

function onSaved() {
  hkManufacturer.value = data.homekit.manufacturer
  hkModel.value = data.homekit.model
  hkPowerUnit.value = data.homekit.powerUnit
  syncLabels()
}

function syncLabels() {
  for (const metric of data.homekitMetrics) {
    labels[metric.key] = data.homekit.labels?.[metric.key] ?? metric.defaultName
  }
}

function appearsAs(metric) {
  if (metric.key === 'battery') return 'Humidity sensor, % (battery charge)'
  const unit = hkPowerUnit.value === 'watts' ? 'W' : 'kW'
  const note = SIGN_NOTES[metric.key]
  return note ? `Temperature sensor, ${unit} (${note})` : `Temperature sensor, ${unit}`
}

function snapshot() {
  return {
    name: hkName.value.trim(),
    pin: hkPin.value.trim(),
    port: Number(hkPort.value),
    manufacturer: hkManufacturer.value.trim(),
    model: hkModel.value.trim(),
    powerUnit: hkPowerUnit.value,
    bind: hkBind.value.trim(),
    labels: { ...labels }
  }
}

function buildPatch() {
  return {
    homekit: {
      name: hkName.value.trim(),
      pin: hkPin.value.trim(),
      port: Number(hkPort.value),
      manufacturer: hkManufacturer.value.trim(),
      model: hkModel.value.trim(),
      powerUnit: hkPowerUnit.value,
      bind: hkBind.value.trim(),
      labels: { ...labels }
    }
  }
}
</script>

<template>
  <HowTo title="How to pair & use HomeKit">
    <ol class="ml-4 space-y-1 list-decimal">
      <li>On your iPhone or iPad, open the <span class="text-zinc-200">Home</span> app.</li>
      <li>Tap <span class="text-zinc-200">+</span>, then <span class="text-zinc-200">Add Accessory</span>.</li>
      <li>Scan the code below, or tap <span class="text-zinc-200">More options…</span> and enter the pairing code.</li>
      <li>The sensors land under Climate. They show degrees and percent; read the values as kW and battery charge.</li>
    </ol>
    <HomekitPairing :pin="hkPin" />
    <p>
      This code matches the running bridge. If you change the bridge name, pairing code, or port, save and
      restart the bridge, then reopen this panel to get the updated code.
    </p>
    <a :href="`${REPO_URL}#reading-the-numbers-in-apple-home`" target="_blank" rel="noopener"
      class="inline-flex items-center gap-1 text-zinc-300 hover:text-zinc-100">
      Reading the numbers in Apple Home<ExternalLink class="w-3.5 h-3.5" />
    </a>
  </HowTo>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2 text-sm text-zinc-400">
        <House class="w-4 h-4" />HomeKit bridge
      </div>
      <span class="flex items-center gap-1.5">
        <span class="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">Requires restart</span>
        <InfoTip topic="restartHomekit" align="right" />
      </span>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="block sm:col-span-2">
        <span class="block mb-1 text-sm text-zinc-400">Bridge name</span>
        <input v-model="hkName" type="text" class="w-full px-3 py-2 rounded-lg bg-zinc-800" />
      </label>
      <label class="block">
        <span class="flex items-center gap-1 mb-1 text-sm text-zinc-400">
          Pairing PIN<InfoTip topic="homekitPin" />
        </span>
        <input v-model="hkPin" type="text" placeholder="516-35-163"
          class="w-full px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
      </label>
      <label class="block">
        <span class="flex items-center gap-1 mb-1 text-sm text-zinc-400">
          HAP port<InfoTip topic="homekitPort" />
        </span>
        <input v-model="hkPort" type="number"
          class="w-full px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
      </label>
      <label class="block sm:col-span-2">
        <span class="flex items-center gap-1 mb-1 text-sm text-zinc-400">
          <Gauge class="w-3.5 h-3.5" />Power display
        </span>
        <select v-model="hkPowerUnit" class="w-full px-3 py-2 rounded-lg bg-zinc-800">
          <option value="kilowatts">Kilowatts (e.g. 4.5°)</option>
          <option value="watts">Watts (e.g. 4500°)</option>
        </select>
        <span class="block mt-1 text-xs text-zinc-500">
          How solar, grid, home, and battery power read on their temperature sensors.
        </span>
      </label>
      <label class="block sm:col-span-2">
        <span class="flex items-center gap-1 mb-1 text-sm text-zinc-400">
          <Network class="w-3.5 h-3.5" />Advertise on address<InfoTip topic="homekitBind" />
        </span>
        <input v-model="hkBind" type="text" placeholder="All interfaces"
          class="w-full px-3 py-2 rounded-lg bg-zinc-800" />
        <span class="block mt-1 text-xs text-zinc-500">
          Advanced. Leave blank to advertise on every interface. On a NAS or Docker host, set the LAN
          IP your phone can reach.
        </span>
      </label>
    </div>
    <div class="p-3 mt-4 space-y-1 rounded-lg bg-amber-500/5 ring-1 ring-amber-500/20">
      <p class="flex items-center gap-1.5 text-xs font-medium text-amber-300">
        <TriangleAlert class="w-3.5 h-3.5" />Fahrenheit homes read these differently
      </p>
      <p class="text-xs text-zinc-400">
        Power rides on temperature sensors, which Apple Home shows in your home's unit. If that's Fahrenheit,
        the values are converted (4.5 reads as 40.1°F), so the number no longer matches the raw kW or watts.
        Switch the Home app to Celsius to read them directly.
      </p>
    </div>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2 text-sm text-zinc-400">
        <Tag class="w-4 h-4" />Apple Home naming
      </div>
      <span class="flex items-center gap-1.5">
        <span class="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">Requires restart</span>
        <InfoTip topic="restartHomekitNaming" align="right" />
      </span>
    </div>
    <p class="mb-3 text-sm text-zinc-500">
      Rename each reading as it appears in Apple Home. Leave a field blank to use its default name.
    </p>
    <div class="space-y-3">
      <label v-for="metric in data.homekitMetrics" :key="metric.key" class="block">
        <span class="block mb-1 text-sm text-zinc-400">{{ metric.defaultName }}</span>
        <input v-model="labels[metric.key]" type="text" :placeholder="metric.defaultName"
          class="w-full px-3 py-2 rounded-lg bg-zinc-800" />
        <span class="block mt-1 text-xs text-zinc-500">{{ appearsAs(metric) }}</span>
      </label>
    </div>
    <div class="pt-4 mt-4 space-y-3 border-t border-zinc-800">
      <p class="text-xs text-zinc-500">Shown in each accessory's info screen in Apple Home.</p>
      <label class="block">
        <span class="block mb-1 text-sm text-zinc-400">Manufacturer</span>
        <input v-model="hkManufacturer" type="text" placeholder="Sigenergy"
          class="w-full px-3 py-2 rounded-lg bg-zinc-800" />
      </label>
      <label class="block">
        <span class="block mb-1 text-sm text-zinc-400">Model</span>
        <input v-model="hkModel" type="text" placeholder="Sigen Home Bridge"
          class="w-full px-3 py-2 rounded-lg bg-zinc-800" />
      </label>
    </div>
    <div class="p-3 mt-4 space-y-1 rounded-lg bg-amber-500/5 ring-1 ring-amber-500/20">
      <p class="flex items-center gap-1.5 text-xs font-medium text-amber-300">
        <TriangleAlert class="w-3.5 h-3.5" />Renaming needs a re-pair
      </p>
      <p class="text-xs text-zinc-400">
        These names are read once when the bridge boots, so save here, then restart the bridge.
      </p>
      <p class="text-xs text-zinc-400">
        Apple Home keeps the names it first paired with. To pick up new names, open the accessory in the Home
        app, choose Accessory Settings, tap Remove Accessory, then add it again with the code above.
      </p>
    </div>
  </section>

  <SaveBar :status="status" :error="error" :dirty="dirty" @save="save">
    <template #hint>
      <span class="text-xs text-right text-zinc-600 text-balance">
        HomeKit changes need a manual restart of the bridge to take effect.
      </span>
    </template>
  </SaveBar>
  <UnsavedDialog :open="pendingLeave" @confirm="confirmLeave" @cancel="cancelLeave" />
</template>
