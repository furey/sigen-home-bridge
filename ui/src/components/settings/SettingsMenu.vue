<script setup>
import { ChevronRight } from '@lucide/vue'
import { SETTINGS_SECTIONS } from './sections.js'
</script>

<template>
  <nav class="flex flex-col gap-2 md:hidden">
    <RouterLink
      v-for="section in SETTINGS_SECTIONS"
      :key="section.name"
      :to="{ name: section.name }"
      class="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-zinc-900 ring-1 ring-zinc-800 text-zinc-200 hover:bg-zinc-800/60"
    >
      <component :is="section.icon" class="w-5 h-5 shrink-0 text-zinc-400" />
      <span class="flex-1 font-medium">{{ section.label }}</span>
      <ChevronRight class="w-5 h-5 shrink-0 text-zinc-600" />
    </RouterLink>
  </nav>
</template>
