<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, RefreshCw } from '@lucide/vue'
import { useStateStream } from '../composables/useStateStream.js'
import { useMetricView } from '../composables/useMetricView.js'
import { useHoverCapable } from '../composables/useHoverCapable.js'
import { accentFor, directionFor, flowAccentFor, flowIconFor, iconFor, metricByKey } from '../lib/metrics.js'
import BrandMark from './BrandMark.vue'

const props = defineProps({
  metricKey: { type: String, required: true }
})

const { state } = useStateStream()
const { viewFor, advance } = useMetricView()
const router = useRouter()

const metric = computed(() => metricByKey(props.metricKey))
const raw = computed(() => state[props.metricKey] ?? 0)
const value = computed(() => metric.value.format(raw.value))
const displayIcon = computed(() => iconFor(metric.value, state))
const glyphFlowIcon = computed(() => flowIconFor(metric.value, raw.value))
const glyphIcon = computed(() => glyphFlowIcon.value ?? displayIcon.value)
const glyphStroke = computed(() => (glyphFlowIcon.value ? 2.5 : 1.5))
const glyphGap = computed(() =>
  glyphFlowIcon.value ? 'calc(var(--mu) * -1.5)' : metric.value.glyphGap)
const glyphIconStyle = computed(() =>
  glyphFlowIcon.value ? { color: flowAccentFor(metric.value, raw.value) } : null)
const color = computed(() => accentFor(metric.value, raw.value))
const direction = computed(() => directionFor(metric.value, raw.value))
const isPercent = computed(() => metric.value.unit === '%')
const socWidth = computed(() =>
  props.metricKey === 'batterySoc'
    ? `${Math.max(0, Math.min(100, raw.value))}%`
    : null)

const view = computed(() => viewFor(VIEW_COUNT))
const toggle = () => advance(VIEW_COUNT)

const hoverCapable = useHoverCapable()
const overContent = ref(false)
const overBack = ref(false)
const showBackHint = computed(() => overBack.value && !overContent.value)

const back = () => router.push({ name: 'dashboard' })
const reload = () => window.location.reload()

const onKey = (event) => {
  if (event.key === 'Escape') back()
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

const VIEW_COUNT = 2
</script>

<template>
  <main
    class="metric-stage relative flex min-h-app cursor-pointer select-none flex-col items-center justify-center p-safe text-center"
    @click="back"
    @mouseenter="overBack = true"
    @mouseleave="overBack = false"
  >
    <div class="pointer-events-none absolute inset-0 z-10 grid grid-cols-3 items-start p-safe">
      <div
        v-if="hoverCapable"
        class="flex items-center gap-2 justify-self-start text-sm text-zinc-500 transition-opacity duration-200"
        :class="showBackHint ? 'opacity-100' : 'opacity-0'"
      >
        <ArrowLeft class="h-4 w-4" />Back
      </div>
      <button
        v-else
        class="pointer-events-auto -m-6 justify-self-start p-6 text-zinc-500"
        aria-label="Back to dashboard"
        @click.stop="back"
      >
        <ArrowLeft class="h-6 w-6" />
      </button>

      <button
        class="pointer-events-auto -m-6 justify-self-center p-6"
        aria-label="Reload app"
        title="Reload app"
        @click.stop="reload"
      >
        <BrandMark class="h-6 w-6 rounded" />
      </button>

      <div
        v-if="hoverCapable"
        class="flex items-center gap-2 justify-self-end text-sm text-zinc-500 transition-opacity duration-200"
        :class="overContent ? 'opacity-100' : 'opacity-0'"
      >
        <RefreshCw class="h-4 w-4" />Cycle view
      </div>
    </div>

    <div
      class="flex cursor-pointer items-center justify-center"
      :class="hoverCapable ? 'h-[78dvh] w-[84vw]' : 'absolute inset-0'"
      @click.stop="toggle"
      @mouseenter="overContent = true"
      @mouseleave="overContent = false"
    >
      <Transition
        enter-active-class="transition-opacity duration-200 ease-out"
        leave-active-class="transition-opacity duration-200 ease-in"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
        mode="out-in"
      >
        <div
          v-if="view === 1"
          key="glyph"
          class="flex transform-gpu items-center justify-center tabular-nums portrait:flex-col portrait:-translate-y-1/8"
          :style="{ color, gap: glyphGap }"
        >
          <component
            :is="glyphIcon"
            class="h-[calc(var(--mu)*16)] w-[calc(var(--mu)*16)]"
            :stroke-width="glyphStroke"
            :style="glyphIconStyle"
          />
          <span class="flex items-baseline leading-none">
            <span class="text-[calc(var(--mu)*16)] font-semibold tracking-tight">{{ value }}</span>
            <span v-if="!isPercent" class="ml-[calc(var(--mu)*0.5)] text-[calc(var(--mu)*4.5)] font-medium text-zinc-500">
              {{ metric.unit }}
            </span>
          </span>
        </div>

        <div v-else key="detail" class="flex transform-gpu flex-col items-center portrait:-translate-y-1/12">
          <p class="flex items-center gap-2 text-xl text-zinc-400">
            <component :is="displayIcon" class="h-5 w-5" />{{ metric.label }}
          </p>
          <p v-if="direction" class="mt-1 text-sm uppercase tracking-widest text-zinc-500">
            {{ direction }}
          </p>
          <p class="my-4 flex items-baseline leading-none tabular-nums" :style="{ color }">
            <span class="text-[calc(var(--mu)*20)] font-semibold tracking-tight">{{ value }}</span>
            <span
              v-if="isPercent"
              class="ml-[calc(var(--mu)*0.5)] text-[calc(var(--mu)*5.5)] font-medium text-zinc-500"
            >
              {{ metric.unit }}
            </span>
          </p>
          <p v-if="!isPercent" class="text-2xl text-zinc-500">{{ metric.unit }}</p>
          <div v-if="socWidth" class="mt-2 h-3 w-2/3 max-w-xl rounded-full bg-zinc-800">
            <div
              class="h-3 rounded-full transition-all"
              :style="{ width: socWidth, backgroundColor: color }"
            ></div>
          </div>
        </div>
      </Transition>
    </div>
  </main>
</template>

<style scoped>
.metric-stage {
  --mu: min(1vw, 1.5vh);
}

@media (orientation: portrait) {
  .metric-stage {
    --mu: 1.4vw;
  }
}
</style>
