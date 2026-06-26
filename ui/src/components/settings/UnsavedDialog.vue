<script setup>
import { CircleAlert } from '@lucide/vue'

defineProps({ open: { type: Boolean, default: false } })
defineEmits(['confirm', 'cancel'])
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div class="absolute inset-0 bg-black/60" @click="$emit('cancel')"></div>
      <div class="relative w-full max-w-sm p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
        <div class="flex items-center gap-2 mb-3 text-sm text-amber-300">
          <CircleAlert class="w-4 h-4" />Unsaved changes
        </div>
        <p class="mb-4 text-sm text-zinc-400">
          This section has changes you haven't saved. Leave without saving?
        </p>
        <div class="flex justify-end gap-3">
          <button class="px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700" @click="$emit('cancel')">
            Stay
          </button>
          <button
            class="px-4 py-2 text-sm font-medium bg-amber-600 rounded-xl hover:bg-amber-500"
            @click="$emit('confirm')"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
