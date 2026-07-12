<script setup>
import { computed, onMounted, ref } from 'vue'
import { LayoutDashboard, Plug } from '@lucide/vue'
import { useSettings } from '../../composables/useSettings.js'
import { useSettingsSection } from '../../composables/useSettingsSection.js'
import { useStateStream } from '../../composables/useStateStream.js'
import InfoTip from '../InfoTip.vue'
import SaveBar from './SaveBar.vue'
import UnsavedDialog from './UnsavedDialog.vue'

const { data, loadOnce } = useSettings()
const { state } = useStateStream()

const showOnDashboard = ref(false)
const smartLoadLabels = ref({})

const detectedSmartLoads = computed(() =>
  state.devices.filter((device) => device.type === 'smartLoad'))

const { status, error, dirty, save, markPristine, pendingLeave, confirmLeave, cancelLeave } =
  useSettingsSection({ snapshot, buildPatch })

onMounted(async () => {
  await loadOnce()
  showOnDashboard.value = Boolean(data.smartLoads.showOnDashboard)
  smartLoadLabels.value = { ...data.smartLoads.labels }
  markPristine()
})

function snapshot() {
  return {
    showOnDashboard: showOnDashboard.value,
    smartLoadLabels: Object.fromEntries(
      Object.entries(trimmedLabels()).filter(([, label]) => label))
  }
}

function buildPatch() {
  return {
    smartLoads: { showOnDashboard: showOnDashboard.value, labels: trimmedLabels() }
  }
}

function trimmedLabels() {
  return Object.fromEntries(
    Object.entries(smartLoadLabels.value).map(([slot, label]) => [slot, (label ?? '').trim()]))
}
</script>

<template>
  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <LayoutDashboard class="w-4 h-4" />Dashboard
    </div>
    <label class="flex items-center gap-2 text-sm text-zinc-300">
      <input v-model="showOnDashboard" type="checkbox" class="w-4 h-4" />
      Show Smart Port on the dashboard
    </label>
    <p class="mt-1 ml-6 text-xs text-zinc-500 !text-pretty">
      Adds the combined Smart Port draw in a fainter shade above the home consumption total,
      Smart Port to the home tile title, a Smart Port line to Trends, and per-load views to the
      home fullscreen cycle. Only applies while Smart Port loads are detected.
    </p>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center justify-between mb-1">
      <div class="flex items-center gap-2 text-sm text-zinc-400">
        <Plug class="w-4 h-4" />Smart load names
      </div>
      <InfoTip topic="smartLoadNames" align="right" />
    </div>
    <template v-if="detectedSmartLoads.length">
      <p class="mb-3 text-xs text-zinc-500 !text-pretty">
        Name the loads on your gateway's Smart Port. Applies live on every connected device; no
        restart needed.
      </p>
      <div class="space-y-3">
        <label v-for="load in detectedSmartLoads" :key="load.index" class="block">
          <span class="block mb-1 text-sm text-zinc-400">Load {{ load.index }}</span>
          <input
            v-model="smartLoadLabels[load.index]"
            type="text"
            :placeholder="`Smart load ${load.index}`"
            class="w-full px-3 py-2 rounded-lg bg-zinc-800"
          />
        </label>
      </div>
    </template>
    <p v-else class="text-xs text-zinc-500 !text-pretty">
      No Smart Port loads detected. Loads appear here once the gateway reports one drawing power
      or with lifetime energy on record.
    </p>
  </section>

  <SaveBar :status="status" :error="error" :dirty="dirty" @save="save" />
  <UnsavedDialog :open="pendingLeave" @confirm="confirmLeave" @cancel="cancelLeave" />
</template>
