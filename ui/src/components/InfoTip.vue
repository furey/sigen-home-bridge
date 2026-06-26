<script setup>
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { Info } from '@lucide/vue'
import { HELP } from '../lib/help.js'

const props = defineProps({
  topic: { type: String, required: true },
  align: { type: String, default: 'left' }
})

const help = HELP[props.topic]
const open = ref(false)
const root = ref(null)
const panel = ref(null)
const style = ref({})

const segments = (text) =>
  text.split('**').map((chunk, index) => ({ text: chunk, bold: index % 2 === 1 }))

const toggle = () => { open.value = !open.value }
const close = () => { open.value = false }

const place = () => {
  const button = root.value?.querySelector('button')
  const el = panel.value
  if (!button || !el) return
  const rect = button.getBoundingClientRect()
  const width = el.offsetWidth
  const height = el.offsetHeight
  const preferred = props.align === 'right' ? rect.right - width : rect.left
  const left = Math.max(8, Math.min(preferred, window.innerWidth - width - 8))
  const below = rect.bottom + 6
  const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below
  style.value = { top: `${top}px`, left: `${left}px` }
}

const onPointerDown = (event) => {
  if (root.value?.contains(event.target) || panel.value?.contains(event.target)) return
  close()
}

const onKey = (event) => {
  if (event.key === 'Escape') close()
}

watch(open, async (isOpen) => {
  const method = isOpen ? 'addEventListener' : 'removeEventListener'
  document[method]('pointerdown', onPointerDown)
  window[method]('keydown', onKey)
  window[method]('resize', place)
  window[method]('scroll', place, true)
  if (isOpen) {
    await nextTick()
    place()
  }
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', place)
  window.removeEventListener('scroll', place, true)
})
</script>

<template>
  <span ref="root" class="relative inline-flex align-middle">
    <button
      type="button"
      class="text-zinc-500 transition-colors hover:text-zinc-300"
      :class="{ 'text-zinc-300': open }"
      :aria-label="help.title"
      @click.stop.prevent="toggle"
    >
      <Info class="w-4 h-4" />
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        ref="panel"
        class="fixed z-[60] w-72 max-w-[80vw] rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-left shadow-xl"
        :style="style"
      >
        <p class="mb-2 text-sm font-medium text-zinc-200">{{ help.title }}</p>
        <template v-for="(item, index) in help.body" :key="index">
          <pre
            v-if="item.code"
            class="p-2 my-2 overflow-x-auto text-xs rounded-md bg-zinc-900 text-zinc-300"
          ><code>{{ item.code }}</code></pre>
          <p v-else class="mb-2 text-xs leading-relaxed text-zinc-400 last:mb-0">
            <template v-for="(segment, position) in segments(item.p)" :key="position">
              <strong v-if="segment.bold" class="font-semibold text-zinc-200">{{ segment.text }}</strong>
              <template v-else>{{ segment.text }}</template>
            </template>
          </p>
        </template>
      </div>
    </Teleport>
  </span>
</template>
