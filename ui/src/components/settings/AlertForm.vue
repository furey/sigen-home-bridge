<script setup>
import { computed, reactive } from 'vue'
import { CircleAlert, CircleCheck, House, LoaderCircle, Webhook } from '@lucide/vue'
import InfoTip from '../InfoTip.vue'
import { useSettings } from '../../composables/useSettings.js'
import { isHttpUrl } from '../../lib/alertValidation.js'

const props = defineProps({
  item: { type: Object, required: true },
  triggers: { type: Array, required: true }
})

const { testAlert } = useSettings()
const test = reactive({ testing: false, result: null })

const NOTIFY_MODES = [
  { value: 'starts', label: 'Starts' },
  { value: 'ends', label: 'Ends' },
  { value: 'both', label: 'Both' }
]

const selectable = computed(() =>
  props.triggers.filter((trigger) => trigger.available || trigger.type === props.item.trigger?.type))

const triggerGroups = computed(() => {
  const groups = new Map()
  for (const trigger of selectable.value) {
    if (!groups.has(trigger.group)) groups.set(trigger.group, [])
    groups.get(trigger.group).push(trigger)
  }
  return [...groups].map(([group, triggers]) => ({ group, triggers }))
})

const params = computed(() => triggerFor(props.item.trigger?.type)?.params ?? [])

const notifyMode = computed({
  get: () => {
    const { raised, cleared } = props.item.notify
    return raised && cleared ? 'both' : cleared ? 'ends' : 'starts'
  },
  set: (mode) => {
    props.item.notify.raised = mode !== 'ends'
    props.item.notify.cleared = mode !== 'starts'
  }
})

const urlMissing = computed(() =>
  props.item.channels.webhook.enabled && !props.item.channels.webhook.url.trim())

const urlInvalid = computed(() => {
  const url = props.item.channels.webhook.url.trim()
  return props.item.channels.webhook.enabled && url && !isHttpUrl(url)
})

const onType = (type) => {
  if (!type) return
  const previous = triggerFor(props.item.trigger?.type)
  const next = triggerFor(type)
  if (!props.item.name.trim() || props.item.name === previous?.label) {
    props.item.name = next?.label ?? props.item.name
  }
  props.item.trigger = { type, ...paramDefaults(next) }
  props.item.notify = { ...(next?.defaultNotify ?? props.item.notify) }
}

const onWebhookToggle = () => {
  const { raised, cleared } = props.item.notify
  if (props.item.channels.webhook.enabled && !raised && !cleared) {
    props.item.notify = { raised: true, cleared: false }
  }
}

const runTest = async () => {
  test.testing = true
  test.result = null
  const { id, name, trigger } = props.item
  test.result = await testAlert({ url: props.item.channels.webhook.url, id, name, trigger })
  test.testing = false
}

const triggerFor = (type) => props.triggers.find((trigger) => trigger.type === type)

const paramDefaults = (trigger) =>
  Object.fromEntries((trigger?.params ?? []).map((param) => [param.key, param.default]))
</script>

<template>
  <div class="space-y-4">
    <label class="block">
      <span class="block mb-1 text-xs text-zinc-500">When</span>
      <select :value="item.trigger?.type ?? ''" class="w-full px-3 py-2 rounded-lg bg-zinc-800"
        @change="onType($event.target.value)">
        <option v-if="!item.trigger" value="" disabled>Choose trigger…</option>
        <optgroup v-for="entry in triggerGroups" :key="entry.group" :label="entry.group">
          <option v-for="trigger in entry.triggers" :key="trigger.type" :value="trigger.type">
            {{ trigger.label }}
          </option>
        </optgroup>
      </select>
    </label>

    <template v-if="item.trigger">
      <label v-for="param in params" :key="param.key" class="block">
        <span class="block mb-1 text-xs text-zinc-500">{{ param.label }}</span>
        <div class="flex items-center gap-2">
          <input v-model.number="item.trigger[param.key]" type="number"
            :min="param.min" :max="param.max" :step="param.step"
            class="w-28 px-3 py-2 rounded-lg bg-zinc-800 tabular-nums" />
          <span class="text-sm text-zinc-500">{{ param.unit }}</span>
        </div>
      </label>

      <label class="block">
        <span class="block mb-1 text-xs text-zinc-500">Name</span>
        <input v-model="item.name" type="text" maxlength="64" placeholder="Alert name"
          class="w-full px-3 py-2 rounded-lg bg-zinc-800" />
      </label>

      <div>
        <span class="block mb-2 text-xs text-zinc-500">Send to</span>
        <label class="flex items-center gap-2 text-sm text-zinc-300">
          <input v-model="item.channels.homekit.enabled" type="checkbox" class="w-4 h-4" />
          <House class="w-4 h-4 text-zinc-400" />Apple Home<InfoTip topic="alertsHomekit" />
        </label>
        <label v-if="item.channels.homekit.enabled" class="block mt-2 ml-6">
          <span class="block mb-1 text-xs text-zinc-500">Contact sensor name</span>
          <input v-model="item.channels.homekit.sensorName" type="text" maxlength="64"
            :placeholder="item.name" class="w-full px-3 py-2 rounded-lg bg-zinc-800" />
          <span class="block mt-1 text-xs text-amber-400/80">
            Adding, removing, or renaming an Apple Home alert needs a restart.
          </span>
        </label>

        <label class="flex items-center gap-2 mt-3 text-sm text-zinc-300">
          <input v-model="item.channels.webhook.enabled" type="checkbox" class="w-4 h-4" @change="onWebhookToggle" />
          <Webhook class="w-4 h-4 text-zinc-400" />Webhook<InfoTip topic="alertsWebhook" />
        </label>
        <div v-if="item.channels.webhook.enabled" class="mt-2 ml-6 space-y-3">
          <div>
            <input v-model="item.channels.webhook.url" type="url" placeholder="https://ntfy.sh/your-topic"
              class="w-full px-3 py-2 rounded-lg bg-zinc-800" />
            <p v-if="urlInvalid" class="mt-1 text-xs text-red-400">Enter a valid http(s) URL.</p>
            <p v-else-if="urlMissing" class="mt-1 text-xs text-amber-400">
              Add a URL to post to, or turn the webhook off.
            </p>
          </div>
          <div>
            <span class="block mb-1 text-xs text-zinc-500">POST on</span>
            <div class="inline-flex p-0.5 rounded-lg bg-zinc-800">
              <button v-for="mode in NOTIFY_MODES" :key="mode.value" type="button"
                class="px-3 py-1.5 text-sm rounded-md transition-colors"
                :class="notifyMode === mode.value ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'"
                @click="notifyMode = mode.value">
                {{ mode.label }}
              </button>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <button
              class="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50"
              :disabled="test.testing || !item.channels.webhook.url"
              @click="runTest"
            >
              <LoaderCircle v-if="test.testing" class="w-4 h-4 animate-spin" />
              {{ test.testing ? 'Sending…' : 'Test' }}
            </button>
            <span v-if="test.result?.ok" class="flex items-center gap-1 text-sm text-green-400">
              <CircleCheck class="w-4 h-4" />Sent
            </span>
            <span v-else-if="test.result" class="flex items-center gap-1 text-sm text-red-400">
              <CircleAlert class="w-4 h-4" />{{ test.result.error }}
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
