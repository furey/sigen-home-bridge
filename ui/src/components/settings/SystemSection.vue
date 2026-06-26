<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Braces, Cpu, DatabaseBackup, Download, RotateCcw, Server, Trash2, Upload } from '@lucide/vue'
import { useSettings } from '../../composables/useSettings.js'
import { useSettingsSection } from '../../composables/useSettingsSection.js'
import { downloadBlob } from '../../lib/download.js'
import { delay } from '../../lib/withMinDuration.js'
import InfoTip from '../InfoTip.vue'
import SaveBar from './SaveBar.vue'
import UnsavedDialog from './UnsavedDialog.vue'

const DEVICES_BUTTON_MODES = [
  { value: 'auto', label: 'Auto' },
  { value: 'show', label: 'Show' },
  { value: 'hide', label: 'Hide' }
]

const router = useRouter()
const { data, loadOnce, applyPatch, reset, undismiss } = useSettings()

const serverPort = ref(5163)
const devicesButton = ref('auto')
const exporting = ref(false)
const resetting = ref(false)
const confirmingReset = ref(false)
const confirmingReopen = ref(false)

const fileInput = ref(null)
const restoreError = ref('')
const restored = ref(false)
const restoring = ref(false)
const confirmingRestore = ref(false)
const pendingImport = ref(null)

const DERIVED_KEYS = ['googleAuthTokenSet', 'homekitMetrics', 'googleMetrics', 'alertTriggers', 'security']

const { status, error, dirty, save, markPristine, pendingLeave, confirmLeave, cancelLeave } =
  useSettingsSection({ snapshot, buildPatch })

onMounted(async () => {
  await loadOnce()
  serverPort.value = data.server.port
  devicesButton.value = data.appearance.devicesButton ?? 'auto'
  markPristine()
})

const reopen = () => {
  confirmingReopen.value = false
  router.push({ name: 'setup' })
}

const openDevices = () => router.push({ name: 'devices' })

const onReset = async () => {
  resetting.value = true
  await reset()
  undismiss()
  resetting.value = false
  router.push({ name: 'setup' })
}

const exportSettings = async () => {
  exporting.value = true
  const payload = { ...data }
  for (const key of DERIVED_KEYS) delete payload[key]
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
  const filename = `sigen-settings-${new Date().toISOString().slice(0, 10)}.json`
  await delay()
  downloadBlob({ blob, filename })
  exporting.value = false
}

const pickFile = () => {
  restoreError.value = ''
  restored.value = false
  fileInput.value?.click()
}

const onFilePicked = async (event) => {
  const [file] = event.target.files ?? []
  event.target.value = ''
  if (!file) return
  try {
    const parsed = JSON.parse(await file.text())
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('That file does not look like a settings backup.')
    }
    pendingImport.value = parsed
    confirmingRestore.value = true
  } catch (parseError) {
    restoreError.value = parseError instanceof SyntaxError
      ? 'That file is not valid JSON.'
      : parseError.message
  }
}

const confirmRestore = async () => {
  const patch = pendingImport.value
  confirmingRestore.value = false
  pendingImport.value = null
  if (!patch) return
  restoring.value = true
  restoreError.value = ''
  try {
    await applyPatch(patch)
    serverPort.value = data.server.port
    markPristine()
    restored.value = true
  } catch (importError) {
    restoreError.value = importError.message
  }
  restoring.value = false
}

function snapshot() {
  return { port: Number(serverPort.value), devicesButton: devicesButton.value }
}

function buildPatch() {
  return {
    server: { port: Number(serverPort.value) },
    appearance: { devicesButton: devicesButton.value }
  }
}
</script>

<template>
  <section class="flex items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div>
      <p class="text-sm text-zinc-300">Setup wizard</p>
      <p class="text-xs text-zinc-500 !text-pretty">Re-walk the guided setup; saved values prefill.</p>
    </div>
    <button class="flex items-center gap-1 px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700" @click="confirmingReopen = true">
      <RotateCcw class="w-4 h-4" />Reopen&nbsp;wizard
    </button>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2 text-sm text-zinc-400">
        <Server class="w-4 h-4" />Server
      </div>
      <span class="flex items-center gap-1.5">
        <span class="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">Requires restart</span>
        <InfoTip topic="restartServer" align="right" />
      </span>
    </div>
    <label class="block">
      <span class="block mb-1 text-sm text-zinc-400">HTTP port</span>
      <input v-model="serverPort" type="number"
        class="w-32 px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
    </label>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center justify-between gap-4">
      <div>
        <p class="text-sm text-zinc-300">Device breakdown</p>
        <p class="text-xs text-zinc-500 !text-pretty">Live per-inverter status, power, and PV-string detail.</p>
      </div>
      <button class="flex items-center gap-1 px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700" @click="openDevices">
        <Cpu class="w-4 h-4" />Open
      </button>
    </div>
    <div class="flex items-center justify-between gap-4 pt-4 mt-4 border-t border-zinc-800">
      <div>
        <p class="text-sm text-zinc-400">Show on dashboard</p>
        <p class="text-xs text-zinc-500 !text-pretty">Auto shows it when more than one device is detected.</p>
      </div>
      <div class="inline-flex shrink-0 rounded-lg bg-zinc-800 p-0.5">
        <button
          v-for="mode in DEVICES_BUTTON_MODES"
          :key="mode.value"
          type="button"
          class="px-3 py-1.5 text-sm rounded-md transition-colors"
          :class="devicesButton === mode.value ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'"
          @click="devicesButton = mode.value"
        >
          {{ mode.label }}
        </button>
      </div>
    </div>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <Braces class="w-4 h-4" />JSON API
    </div>
    <p class="text-sm text-zinc-500 !text-pretty">
      Everything the dashboard shows is also at
      <a
        href="/api/snapshot?pretty"
        target="_blank"
        rel="noopener noreferrer"
        class="font-mono text-zinc-300 underline decoration-zinc-600 underline-offset-2 transition-colors hover:text-zinc-100 hover:decoration-zinc-400"
      >/api/snapshot</a>
      as JSON, read-only, for your own scripts and dashboards. History lives at
      <a
        href="/api/history?order=desc&limit=200&pretty"
        target="_blank"
        rel="noopener noreferrer"
        class="font-mono text-zinc-300 underline decoration-zinc-600 underline-offset-2 transition-colors hover:text-zinc-100 hover:decoration-zinc-400"
      >/api/history</a>
      and <code>/api/history/export</code>. The project's
      <a
        href="https://github.com/furey/sigen-home-bridge/blob/main/docs/DEEP_DIVE.md"
        target="_blank"
        rel="noopener noreferrer"
        class="font-mono text-zinc-300 underline decoration-zinc-600 underline-offset-2 transition-colors hover:text-zinc-100 hover:decoration-zinc-400"
      >DEEP_DIVE.md</a>
      documents every field.
    </p>
  </section>

  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center gap-2 mb-3 text-sm text-zinc-400">
      <DatabaseBackup class="w-4 h-4" />Backup & restore
    </div>
    <p class="mb-4 text-sm text-zinc-500">
      Download your settings as a JSON file, or restore them from a previous download. Your Google
      auth token isn't included, so restoring leaves the token already on this bridge in place.
    </p>
    <div class="flex flex-wrap gap-3">
      <button
        class="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
        :disabled="exporting"
        @click="exportSettings"
      >
        <Download class="w-4 h-4" />{{ exporting ? 'Preparing…' : 'Download' }}
      </button>
      <button
        class="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
        :disabled="restoring"
        @click="pickFile"
      >
        <Upload class="w-4 h-4" />{{ restoring ? 'Restoring…' : 'Restore' }}
      </button>
      <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="onFilePicked" />
    </div>
    <p v-if="restoreError" class="mt-3 text-sm text-red-400">{{ restoreError }}</p>
    <p v-else-if="restored" class="mt-3 text-sm text-green-400">
      Settings restored. Restart the bridge if you changed gateway, HomeKit, or server values.
    </p>
  </section>

  <section class="p-5 rounded-2xl bg-red-950/30 ring-1 ring-red-900/50">
    <div class="flex items-center gap-2 mb-3 text-sm text-red-300">
      <Trash2 class="w-4 h-4" />Danger zone
    </div>
    <p class="mb-3 text-sm text-zinc-400">
      Reset configuration wipes <code>settings.json</code> back to the environment defaults and
      re-runs the setup wizard. Your HomeKit pairing is untouched.
    </p>
    <button
      class="px-4 py-2 text-sm font-medium bg-red-600 rounded-xl hover:bg-red-500 disabled:opacity-50"
      :disabled="resetting"
      @click="confirmingReset = true"
    >
      {{ resetting ? 'Resetting…' : 'Reset configuration' }}
    </button>
  </section>

  <SaveBar :status="status" :error="error" :dirty="dirty" @save="save">
    <template #hint>
      <span class="text-xs text-right text-zinc-600 text-balance">
        The server port needs a manual restart of the bridge to take effect.
      </span>
    </template>
  </SaveBar>

  <UnsavedDialog :open="pendingLeave" @confirm="confirmLeave" @cancel="cancelLeave" />

  <Teleport to="body">
    <div v-if="confirmingRestore" class="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div class="absolute inset-0 bg-black/60" @click="confirmingRestore = false"></div>
      <div class="relative w-full max-w-sm p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
        <div class="flex items-center gap-2 mb-3 text-sm text-zinc-300">
          <Upload class="w-4 h-4" />Restore settings?
        </div>
        <p class="mb-4 text-sm text-zinc-400">
          This overwrites your current settings with the values in the file. Your Google auth token
          and HomeKit pairing stay as they are. Restart the bridge afterwards if gateway, HomeKit, or
          server values changed.
        </p>
        <div class="flex justify-end gap-3">
          <button
            class="px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700"
            @click="confirmingRestore = false"
          >
            Cancel
          </button>
          <button
            class="px-4 py-2 text-sm font-medium rounded-xl bg-zinc-200 text-zinc-900 hover:bg-white"
            @click="confirmRestore"
          >
            Restore
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="confirmingReopen" class="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div class="absolute inset-0 bg-black/60" @click="confirmingReopen = false"></div>
      <div class="relative w-full max-w-sm p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
        <div class="flex items-center gap-2 mb-3 text-sm text-zinc-300">
          <RotateCcw class="w-4 h-4" />Reopen setup wizard?
        </div>
        <p class="mb-4 text-sm text-zinc-400">
          This leaves Settings and walks you through the guided setup again. Saved values
          prefill, so nothing changes until you step through and save.
        </p>
        <div class="flex justify-end gap-3">
          <button
            class="px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700"
            @click="confirmingReopen = false"
          >
            Cancel
          </button>
          <button
            class="px-4 py-2 text-sm font-medium rounded-xl bg-zinc-200 text-zinc-900 hover:bg-white"
            @click="reopen"
          >
            Reopen wizard
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="confirmingReset" class="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div class="absolute inset-0 bg-black/60" @click="confirmingReset = false"></div>
      <div class="relative w-full max-w-sm p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
        <div class="flex items-center gap-2 mb-3 text-sm text-red-300">
          <Trash2 class="w-4 h-4" />Reset configuration?
        </div>
        <p class="mb-4 text-sm text-zinc-400">
          This wipes <code>settings.json</code> back to defaults and re-runs the setup wizard.
          Your HomeKit pairing is untouched. This can't be undone.
        </p>
        <div class="flex justify-end gap-3">
          <button
            class="px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700"
            @click="confirmingReset = false"
          >
            Cancel
          </button>
          <button
            class="px-4 py-2 text-sm font-medium bg-red-600 rounded-xl hover:bg-red-500 disabled:opacity-50"
            :disabled="resetting"
            @click="onReset"
          >
            {{ resetting ? 'Resetting…' : 'Reset' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
