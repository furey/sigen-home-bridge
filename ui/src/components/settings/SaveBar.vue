<script setup>
import { computed } from 'vue'
import { LoaderCircle } from '@lucide/vue'

const props = defineProps({
  status: { type: String, default: 'idle' },
  error: { type: String, default: '' },
  dirty: { type: Boolean, default: false }
})
defineEmits(['save'])

const saving = computed(() => props.status === 'saving')
const actionable = computed(() => props.dirty && !saving.value)
const buttonClass = computed(() =>
  actionable.value || saving.value
    ? 'bg-green-600 text-white hover:bg-green-500'
    : 'cursor-not-allowed bg-zinc-800 text-zinc-600 ring-1 ring-inset ring-zinc-700')
</script>

<template>
  <Teleport to="#settings-save-footer" defer>
    <div class="flex items-center gap-3 mx-auto max-w-4xl px-safe">
      <div class="flex flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-1">
        <slot name="hint" />
        <span v-if="status === 'saved' && !dirty" class="text-sm text-right text-green-400 text-balance">Saved</span>
        <span v-else-if="status === 'error'" class="text-sm text-right text-red-400 text-balance">{{ error }}</span>
      </div>
      <button
        class="flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors"
        :class="buttonClass"
        :disabled="!actionable"
        @click="$emit('save')"
      >
        <LoaderCircle v-if="saving" class="w-4 h-4 animate-spin" />
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
    </div>
  </Teleport>
</template>
