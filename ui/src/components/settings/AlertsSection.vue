<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { BellRing, ChevronDown, Plus, Trash2 } from '@lucide/vue'
import InfoTip from '../InfoTip.vue'
import { useSettings } from '../../composables/useSettings.js'
import { useSettingsSection } from '../../composables/useSettingsSection.js'
import { useStateStream } from '../../composables/useStateStream.js'
import { alertWebhookValid } from '../../lib/alertValidation.js'
import AlertForm from './AlertForm.vue'
import AlertModal from './AlertModal.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import SaveBar from './SaveBar.vue'
import UnsavedDialog from './UnsavedDialog.vue'

const SORT_KEY = 'sigenAlertsSort'
const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'az', label: 'Name A–Z' },
  { value: 'za', label: 'Name Z–A' }
]

const { data, loadOnce } = useSettings()
const { state } = useStateStream()

const form = reactive({ items: [] })
const expanded = ref(new Set())
const sort = ref(readSort())
const modalOpen = ref(false)
const draft = ref(null)
const pendingDelete = ref(null)

const { status, error, dirty, save, markPristine, pendingLeave, confirmLeave, cancelLeave } =
  useSettingsSection({ snapshot, buildPatch })

onMounted(async () => {
  await loadOnce()
  form.items = (data.alerts.items ?? []).map(clone)
  markPristine()
})

const sortedItems = computed(() => {
  const indexed = form.items.map((item, index) => ({ item, index }))
  const compare = {
    newest: (a, b) => b.index - a.index,
    oldest: (a, b) => a.index - b.index,
    az: (a, b) => a.item.name.localeCompare(b.item.name) || a.index - b.index,
    za: (a, b) => b.item.name.localeCompare(a.item.name) || a.index - b.index
  }[sort.value] ?? ((a, b) => b.index - a.index)
  return [...indexed].sort(compare).map((entry) => entry.item)
})

const activeIds = computed(() => new Set(state.alerts.map((alert) => alert.id)))
const savedIds = computed(() => new Set((data.alerts.items ?? []).map((item) => item.id)))

const isOpen = (id) => expanded.value.has(id)
const isActive = (id) => activeIds.value.has(id)
const toggle = (id) => (isOpen(id) ? expanded.value.delete(id) : expanded.value.add(id))

const triggerFor = (type) => data.alertTriggers.find((trigger) => trigger.type === type)

const conditionSummary = (item) => {
  const trigger = triggerFor(item.trigger?.type)
  if (!trigger) return item.trigger?.type ?? ''
  const parts = trigger.params.map((param) => `${item.trigger[param.key]}${param.unit}`).join(', ')
  return parts ? `${trigger.label} · ${parts}` : trigger.label
}

const destinationSummary = (item) => {
  const sent = []
  if (item.channels.homekit.enabled) sent.push('Apple Home')
  if (item.channels.webhook.enabled) sent.push(webhookLabel(item))
  return sent.length ? sent.join(', ') : 'in-app only'
}

const webhookLabel = (item) => {
  const { raised, cleared } = item.notify
  return raised && cleared ? 'Webhook' : cleared ? 'Webhook (ends)' : 'Webhook (starts)'
}

const statusLabel = (item) =>
  !item.enabled ? 'Paused' : isActive(item.id) ? 'Active' : 'Clear'

const statusClass = (item) =>
  !item.enabled ? 'text-zinc-500' : isActive(item.id) ? 'text-red-400' : 'text-green-400'

const dotClass = (item) =>
  !item.enabled ? 'bg-zinc-600' : isActive(item.id) ? 'bg-red-400' : 'bg-green-400'

const openAdd = () => {
  draft.value = reactive({
    id: newId(),
    name: '',
    enabled: true,
    trigger: null,
    notify: { raised: true, cleared: false },
    channels: {
      homekit: { enabled: false, sensorName: '' },
      webhook: { enabled: false, url: '' }
    }
  })
  modalOpen.value = true
}

const commitAdd = () => {
  form.items.push(clone(draft.value))
  closeModal()
}

const closeModal = () => {
  modalOpen.value = false
  draft.value = null
}

const removeAlert = (item) =>
  savedIds.value.has(item.id) ? (pendingDelete.value = item) : deleteAlert(item)

const deleteAlert = (item) => {
  const index = form.items.findIndex((entry) => entry.id === item.id)
  if (index >= 0) form.items.splice(index, 1)
  expanded.value.delete(item.id)
}

const confirmDelete = () => {
  deleteAlert(pendingDelete.value)
  pendingDelete.value = null
}

const deletePrompt = computed(() =>
  pendingDelete.value
    ? `“${pendingDelete.value.name || 'Untitled alert'}” will be removed from your alerts when you save.`
    : '')

const onSave = async () => {
  const invalid = form.items.find((item) => !alertWebhookValid(item))
  if (invalid) return expanded.value.add(invalid.id)
  await save()
}

const clone = (value) => JSON.parse(JSON.stringify(value))

const newId = () =>
  crypto.randomUUID?.() ?? `alert-${Math.random().toString(36).slice(2, 10)}`

function readSort() {
  try {
    return localStorage.getItem(SORT_KEY) || 'newest'
  } catch {
    return 'newest'
  }
}

watch(sort, (value) => {
  try {
    localStorage.setItem(SORT_KEY, value)
  } catch {}
})

function snapshot() {
  return {
    items: form.items.map((item) => ({
      id: item.id,
      name: item.name.trim(),
      enabled: item.enabled,
      trigger: cleanTrigger(item.trigger),
      notify: { raised: Boolean(item.notify.raised), cleared: Boolean(item.notify.cleared) },
      channels: {
        homekit: { enabled: Boolean(item.channels.homekit.enabled), sensorName: item.channels.homekit.sensorName.trim() },
        webhook: { enabled: Boolean(item.channels.webhook.enabled), url: item.channels.webhook.url.trim() }
      }
    }))
  }
}

function cleanTrigger(trigger) {
  const out = { type: trigger.type }
  for (const param of triggerFor(trigger.type)?.params ?? []) {
    const value = Number(trigger[param.key])
    if (Number.isFinite(value)) out[param.key] = value
  }
  return out
}

function buildPatch() {
  return { alerts: snapshot() }
}
</script>

<template>
  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center justify-between gap-3 mb-1">
      <div class="flex items-center gap-2 text-sm text-zinc-400">
        <BellRing class="w-4 h-4" />Alerts<InfoTip topic="alertsRules" />
      </div>
      <button class="flex items-center gap-1 text-sm text-zinc-300 hover:text-white" @click="openAdd">
        <Plus class="w-4 h-4" />Add alert
      </button>
    </div>
    <p class="mb-4 text-xs text-zinc-500">
      Each alert watches one value and notifies through the channels you pick. An alert runs as soon as it’s on.
    </p>

    <p v-if="!form.items.length" class="text-sm text-zinc-600">
      No alerts yet. Add one to watch the gateway, battery, power flows, weather, or cost.
    </p>

    <template v-else>
      <div class="flex justify-end mb-2">
        <select v-model="sort" class="px-2 py-1 text-xs rounded-lg bg-zinc-800 text-zinc-300">
          <option v-for="option in SORTS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </div>

      <div class="space-y-2">
        <div v-for="item in sortedItems" :key="item.id"
          class="overflow-hidden rounded-xl bg-zinc-950/40 ring-1 ring-zinc-800">
          <div class="flex items-center gap-3 p-3 cursor-pointer" @click="toggle(item.id)">
            <input v-model="item.enabled" type="checkbox" class="w-4 h-4 shrink-0" @click.stop />
            <div class="min-w-0 grow">
              <div class="text-sm truncate text-zinc-200">{{ item.name || 'Untitled alert' }}</div>
              <div class="mt-0.5 text-xs text-zinc-500 truncate">
                {{ conditionSummary(item) }} <span class="text-zinc-700">·</span> {{ destinationSummary(item) }}
              </div>
            </div>
            <span class="flex items-center gap-1.5 text-xs shrink-0" :class="statusClass(item)">
              <span class="w-2 h-2 rounded-full" :class="dotClass(item)" />{{ statusLabel(item) }}
            </span>
            <ChevronDown class="w-4 h-4 transition-transform text-zinc-500 shrink-0" :class="isOpen(item.id) && 'rotate-180'" />
            <button class="text-zinc-500 hover:text-red-400 shrink-0" aria-label="Remove alert" @click.stop="removeAlert(item)">
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
          <div v-if="isOpen(item.id)" class="px-4 pt-1 pb-4 border-t border-zinc-800">
            <AlertForm :item="item" :triggers="data.alertTriggers" />
          </div>
        </div>
      </div>
    </template>
  </section>

  <AlertModal :open="modalOpen" :item="draft" :triggers="data.alertTriggers" @add="commitAdd" @cancel="closeModal" />
  <ConfirmDialog :open="Boolean(pendingDelete)" title="Delete alert?" :message="deletePrompt"
    confirm-label="Delete" @confirm="confirmDelete" @cancel="pendingDelete = null" />
  <SaveBar :status="status" :error="error" :dirty="dirty" @save="onSave" />
  <UnsavedDialog :open="pendingLeave" @confirm="confirmLeave" @cancel="cancelLeave" />
</template>
