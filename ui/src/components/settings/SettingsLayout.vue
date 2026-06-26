<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ChevronRight, X } from '@lucide/vue'
import { useDashboardView } from '../../composables/useDashboardView.js'
import { useSettings } from '../../composables/useSettings.js'
import { useSession } from '../../composables/useSession.js'
import { SETTINGS_SECTIONS } from './sections.js'
import PasscodeGate from './PasscodeGate.vue'

const router = useRouter()
const route = useRoute()
const { view } = useDashboardView()
const { data, loadOnce, verifySession } = useSettings()
const { unlocked, clearToken, expiredMidEdit } = useSession()

const ready = ref(false)
const locked = computed(() => data.security.passcodeSet && !unlocked.value)

const atMenu = computed(() => route.name === 'settings')

const currentLabel = computed(() =>
  SETTINGS_SECTIONS.find((section) => section.name === route.name)?.label ?? '')

const navClass = (name) =>
  route.name === name
    ? 'bg-zinc-800 text-zinc-100'
    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'

const close = () => router.push({ name: view.trends ? 'trends' : 'dashboard' })
const backToMenu = () => router.push({ name: 'settings' })

const mediaQuery = window.matchMedia('(min-width: 768px)')
const isDesktop = ref(mediaQuery.matches)
const syncDesktop = () => { isDesktop.value = mediaQuery.matches }

const HEADER_TO_BODY_GAP_PX = 16

const header = ref(null)
const headerHeight = ref(0)
const railTop = computed(() => `${headerHeight.value + HEADER_TO_BODY_GAP_PX}px`)
let headerObserver

onMounted(async () => {
  mediaQuery.addEventListener('change', syncDesktop)
  headerObserver = new ResizeObserver(([entry]) => { headerHeight.value = entry.target.offsetHeight })
  if (header.value) headerObserver.observe(header.value)
  expiredMidEdit.value = false
  await loadOnce()
  if (data.security.passcodeSet && unlocked.value && !(await verifySession())) clearToken()
  ready.value = true
})

watch(header, (element) => { if (element) headerObserver?.observe(element) })

onUnmounted(() => {
  mediaQuery.removeEventListener('change', syncDesktop)
  headerObserver?.disconnect()
})

watch([isDesktop, () => route.name], () => {
  if (isDesktop.value && atMenu.value) router.replace({ name: SETTINGS_SECTIONS[0].name })
}, { immediate: true })
</script>

<template>
  <div v-if="!ready" class="h-app"></div>
  <PasscodeGate v-else-if="locked && !expiredMidEdit" @close="close" />
  <main v-else class="flex flex-col h-app max-w-4xl mx-auto overflow-hidden">
    <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain">
      <header ref="header" class="sticky top-0 z-30 px-safe pt-safe pb-1 bg-zinc-950 md:flex md:gap-6">
        <div class="items-center hidden md:flex md:w-44 md:shrink-0">
          <button class="flex items-center gap-1 text-zinc-500 transition hover:text-zinc-300" @click="close">
            <ArrowLeft class="w-5 h-5" />Back
          </button>
        </div>
        <div class="flex items-center justify-between gap-3 min-w-0 md:flex-1">
          <h1 class="flex items-center min-w-0 text-lg font-semibold leading-tight tracking-tight">
            <span class="items-center hidden gap-1.5 min-w-0 md:flex">
              <span class="shrink-0">Settings</span>
              <ChevronRight class="w-4 h-4 shrink-0 text-zinc-600" />
              <span class="font-medium truncate text-zinc-400">{{ currentLabel }}</span>
            </span>
            <button
              v-if="!atMenu"
              class="group flex items-center gap-1.5 min-w-0 py-1.5 pl-1 pr-3 -my-1.5 -ml-1 text-zinc-100 hover:text-zinc-300 md:hidden"
              aria-label="Back to settings menu"
              @click="backToMenu"
            >
              <ArrowLeft class="w-5 h-5 shrink-0 text-zinc-500 transition group-hover:text-zinc-300" />
              <span class="truncate">{{ currentLabel }}</span>
            </button>
            <span v-else class="truncate md:hidden">Settings</span>
          </h1>
          <button class="shrink-0 text-zinc-400 hover:text-zinc-100 md:hidden" aria-label="Close settings" @click="close">
            <X class="w-5 h-5" />
          </button>
        </div>
      </header>

      <div v-if="ready" class="mt-4 px-safe md:flex md:gap-6">
        <nav class="hidden md:block md:w-44 md:shrink-0 md:sticky md:self-start" :style="{ top: railTop }">
          <div class="flex flex-col gap-1">
            <RouterLink
              v-for="section in SETTINGS_SECTIONS"
              :key="section.name"
              :to="{ name: section.name }"
              class="flex items-center w-full gap-2 px-3 py-2 text-sm rounded-lg"
              :class="navClass(section.name)"
            >
              <component :is="section.icon" class="w-4 h-4 shrink-0" />{{ section.label }}
            </RouterLink>
          </div>
        </nav>

        <div class="flex-1 min-w-0 space-y-4 pb-6">
          <RouterView v-slot="{ Component }">
            <component :is="Component" />
          </RouterView>
        </div>
      </div>
    </div>

    <div id="settings-save-footer" class="settings-footer flex-none"></div>
  </main>
  <PasscodeGate v-if="locked && expiredMidEdit" overlay @close="close" />
</template>

<style scoped>
.settings-footer:empty {
  display: none;
}

.settings-footer {
  padding-top: 0.75rem;
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
  border-top: 1px solid rgb(63 63 70);
  background-color: rgb(9 9 11);
  box-shadow: 0 -10px 30px 6px rgb(0 0 0 / 0.7);
}
</style>
