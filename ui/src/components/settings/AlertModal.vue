<script setup>
import { computed, onUnmounted, watch } from 'vue'
import { BellPlus, X } from '@lucide/vue'
import AlertForm from './AlertForm.vue'
import { alertWebhookValid } from '../../lib/alertValidation.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  item: { type: Object, default: null },
  triggers: { type: Array, required: true }
})

const emit = defineEmits(['add', 'cancel'])

const canAdd = computed(() => Boolean(props.item?.trigger) && alertWebhookValid(props.item))

const onKey = (event) => {
  if (event.key === 'Escape') emit('cancel')
}

watch(() => props.open, (open) => {
  window[open ? 'addEventListener' : 'removeEventListener']('keydown', onKey)
})

onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div class="absolute inset-0 bg-black/60" />
      <div class="relative flex flex-col w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92vh] bg-zinc-900 ring-1 ring-zinc-800">
        <div class="flex items-center justify-between p-5 border-b border-zinc-800">
          <span class="flex items-center gap-2 text-sm text-zinc-300">
            <BellPlus class="w-4 h-4" />New alert
          </span>
          <button class="text-zinc-500 hover:text-zinc-200" aria-label="Cancel" @click="emit('cancel')">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-5 overflow-y-auto grow">
          <AlertForm v-if="item" :item="item" :triggers="triggers" />
          <p v-if="!item?.trigger" class="mt-3 text-xs text-zinc-600">
            Pick a trigger to configure this alert.
          </p>
        </div>
        <div class="flex justify-end gap-3 p-5 border-t border-zinc-800">
          <button class="px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700" @click="emit('cancel')">
            Cancel
          </button>
          <button
            class="px-4 py-2 text-sm font-medium text-white rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:hover:bg-green-600"
            :disabled="!canAdd"
            @click="emit('add')"
          >
            Add alert
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
