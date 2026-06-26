<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Lock, LockOpen } from '@lucide/vue'
import { useSettings } from '../../composables/useSettings.js'
import { useHoverCapable } from '../../composables/useHoverCapable.js'
import PinPad from './PinPad.vue'

const props = defineProps({ overlay: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

const { unlock, commitSession } = useSettings()
const hoverCapable = useHoverCapable()

const busy = ref(false)
const succeeded = ref(false)
const dismissing = ref(false)
const attemptError = ref(null)
const lockedSeconds = ref(0)
const pad = ref(null)

let countdown = null
let revealTimer = null

const onEscape = (event) => {
  if (event.key === 'Escape' && !succeeded.value) emit('close')
}

onMounted(() => {
  if (hoverCapable.value) window.addEventListener('keydown', onEscape)
})

onUnmounted(() => {
  clearInterval(countdown)
  clearTimeout(revealTimer)
  window.removeEventListener('keydown', onEscape)
})

const onSubmit = async (code) => {
  busy.value = true
  attemptError.value = null
  try {
    const { token } = await unlock(code)
    celebrate(token)
  } catch (error) {
    if (error.status === 429) startLockout(error.retryAfter ?? 60)
    else attemptError.value = attemptParts(error)
    pad.value?.shake()
    busy.value = false
  }
}

const celebrate = (token) => {
  succeeded.value = true
  navigator.vibrate?.(18)
  const reduce = prefersReducedMotion()
  const hold = (reduce ? 0 : SUCCESS_ANIM_MS) + BREATH_MS
  revealTimer = setTimeout(() => {
    dismissing.value = true
    revealTimer = setTimeout(() => commitSession(token), reduce ? REDUCED_DISMISS_MS : DISMISS_MS)
  }, hold)
}

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

const status = computed(() => {
  if (succeeded.value) return { text: 'Access granted.', tone: 'text-green-400' }
  if (lockedSeconds.value > 0) {
    return { text: 'Too many attempts.', detail: `Try again in ${lockedSeconds.value}s.`, tone: 'text-amber-400' }
  }
  if (attemptError.value) return { ...attemptError.value, tone: 'text-red-400' }
  return { text: props.overlay ? 'Re-enter your passcode to continue.' : 'Enter your passcode to access.', tone: 'text-zinc-500' }
})

const heading = computed(() => {
  if (succeeded.value) return 'Unlocked'
  return props.overlay ? 'Session expired' : 'Settings are locked'
})

const attemptParts = (error) =>
  Number.isInteger(error.remaining)
    ? { text: 'Incorrect passcode.', detail: `${error.remaining} ${error.remaining === 1 ? 'try' : 'tries'} left.` }
    : { text: error.message }

const startLockout = (seconds) => {
  lockedSeconds.value = seconds
  attemptError.value = null
  clearInterval(countdown)
  countdown = setInterval(() => {
    lockedSeconds.value -= 1
    if (lockedSeconds.value <= 0) clearInterval(countdown)
  }, 1000)
}

const SUCCESS_ANIM_MS = 500

const BREATH_MS = 400

const DISMISS_MS = 300

const REDUCED_DISMISS_MS = 150
</script>

<template>
  <div :class="overlay ? 'gate-overlay fixed inset-0 z-50 flex flex-col' : 'flex flex-col h-app'">
    <div class="flex flex-1 items-center justify-center px-safe">
      <section class="gate-card w-full max-w-sm p-6 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800" :class="{ 'gate-success': succeeded, 'gate-dismiss': dismissing }">
        <div class="gate-body flex flex-col items-center">
          <div class="gate-header flex flex-col items-center text-center">
            <div
              class="gate-badge relative flex items-center justify-center w-12 h-12 mb-4 rounded-full transition-colors duration-300"
              :class="succeeded ? 'bg-green-500/15 text-green-400' : 'bg-zinc-800 text-zinc-300'"
            >
              <LockOpen v-if="succeeded" class="w-5 h-5" />
              <Lock v-else class="w-5 h-5" />
            </div>
            <h2 class="text-base font-semibold transition-colors duration-300" :class="succeeded ? 'text-green-400' : 'text-zinc-100'">
              {{ heading }}
            </h2>
            <p
              class="gate-subtitle flex flex-wrap items-center justify-center gap-x-1 mt-1 mb-7 text-sm text-pretty transition-colors duration-300"
              :class="status.tone"
            >
              <span>{{ status.text }}</span>
              <span v-if="status.detail">{{ status.detail }}</span>
            </p>
            <button
              type="button"
              :disabled="succeeded"
              class="gate-cancel-landscape mt-4 text-sm text-zinc-400 transition hover:text-zinc-200 disabled:opacity-40 disabled:pointer-events-none"
              @click="emit('close')"
            >
              Cancel
            </button>
          </div>
          <div class="gate-input flex flex-col items-center">
            <PinPad
              ref="pad"
              :busy="busy"
              :disabled="succeeded || lockedSeconds > 0"
              :success="succeeded"
              @submit="onSubmit"
              @input="attemptError = null"
            />
            <button
              type="button"
              :disabled="succeeded"
              class="gate-cancel mt-6 text-sm text-zinc-400 transition hover:text-zinc-200 disabled:opacity-40 disabled:pointer-events-none"
              @click="emit('close')"
            >
              Cancel
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.gate-overlay {
  background-color: rgb(9 9 11 / 0.85);
  backdrop-filter: blur(4px);
  animation: gate-overlay-in 0.2s ease-out;
}

@keyframes gate-overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.gate-card {
  animation: gate-enter 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.gate-success {
  animation: gate-success 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.gate-dismiss {
  animation: gate-dismiss 0.3s ease-in both;
}

@keyframes gate-enter {
  0% { transform: scale(0.92); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes gate-success {
  0% { transform: scale(0.96); }
  60% { transform: scale(1.03); }
  100% { transform: scale(1); }
}

@keyframes gate-dismiss {
  to { transform: scale(0.96); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .gate-card,
  .gate-success {
    animation: none;
  }

  .gate-dismiss {
    animation: none;
    opacity: 0;
    transition: opacity 0.15s linear;
  }
}

.gate-cancel-landscape {
  display: none;
}

@media (orientation: landscape) and (max-height: 519px),
       (orientation: landscape) and (min-height: 520px) and (hover: none) {
  .gate-body {
    flex-direction: row;
    align-items: center;
  }

  .gate-header,
  .gate-input {
    flex: 1 1 0;
    min-width: 0;
  }

  .gate-subtitle {
    flex-direction: column;
    margin-bottom: 0;
  }

  .gate-cancel {
    display: none;
  }

  .gate-cancel-landscape {
    display: block;
  }
}

@media (orientation: landscape) and (max-height: 519px) {
  .gate-card {
    max-width: 30rem;
    padding: 2rem;
  }

  .gate-body {
    gap: 3.5rem;
  }
}

@media (orientation: landscape) and (min-height: 520px) and (hover: none) {
  .gate-card {
    max-width: min(64rem, 92vw);
    padding: clamp(2rem, 4vw, 3.5rem);
  }

  .gate-body {
    gap: clamp(2.5rem, 6vw, 5rem);
  }

  .gate-badge {
    width: 4rem;
    height: 4rem;
    margin-bottom: 1.25rem;
  }

  .gate-badge svg {
    width: 1.75rem;
    height: 1.75rem;
  }

  .gate-header h2 {
    font-size: 1.375rem;
  }

  .gate-subtitle {
    font-size: 1rem;
  }
}
</style>
