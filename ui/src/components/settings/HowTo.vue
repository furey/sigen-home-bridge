<script setup>
import { ref } from 'vue'
import { BookOpen, ChevronDown } from '@lucide/vue'

defineProps({ title: { type: String, required: true } })

const open = ref(false)
</script>

<template>
  <div class="rounded-xl bg-zinc-950/40 ring-1 ring-zinc-800">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-zinc-300 hover:text-zinc-100"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="flex items-center gap-2"><BookOpen class="w-4 h-4" />{{ title }}</span>
      <ChevronDown class="w-4 h-4 transition-transform" :class="{ 'rotate-180': open }" />
    </button>
    <div
      v-if="open"
      class="px-4 py-3 space-y-3 text-sm leading-relaxed border-t border-zinc-800 text-zinc-400"
    >
      <slot />
    </div>
  </div>
</template>
