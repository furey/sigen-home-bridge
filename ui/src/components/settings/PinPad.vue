<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { Delete } from '@lucide/vue'
import { useHoverCapable } from '../../composables/useHoverCapable.js'

const props = defineProps({
  length: { type: Number, default: 4 },
  busy: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  success: { type: Boolean, default: false }
})
const emit = defineEmits(['submit', 'input'])

const hoverCapable = useHoverCapable()
const digits = ref('')
const shaking = ref(false)
const field = ref(null)
const dots = ref(null)

const press = (key) => {
  if (locked() || full()) return
  digits.value += key
  popDot(digits.value.length)
  emit('input')
  if (full()) emit('submit', digits.value)
}

const backspace = () => {
  if (locked() || !digits.value) return
  digits.value = digits.value.slice(0, -1)
}

const popKey = (event) => {
  if (locked() || reduceMotion()) return
  event.currentTarget.animate(KEY_POP_FRAMES, KEY_POP_TIMING)
}

const popDot = (slot) => {
  if (reduceMotion()) return
  dots.value?.children[slot - 1]?.animate(DOT_POP_FRAMES, DOT_POP_TIMING)
}

const onFieldInput = (event) => {
  const cleaned = event.target.value.replace(/\D/g, '').slice(0, props.length)
  digits.value = cleaned
  emit('input')
  if (full()) emit('submit', digits.value)
}

const shake = () => {
  digits.value = ''
  shaking.value = true
  setTimeout(() => { shaking.value = false }, SHAKE_MS)
  if (hoverCapable.value) focusField()
}

const clear = () => { digits.value = '' }

defineExpose({ shake, clear })

const dotClass = (slot) => {
  if (slot > digits.value.length) return 'border-zinc-600'
  return props.success ? 'bg-green-400 border-green-400' : 'bg-zinc-100 border-zinc-100'
}

const locked = () => props.disabled || props.busy
const full = () => digits.value.length >= props.length

const reduceMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

const focusField = () => requestAnimationFrame(() => field.value?.focus())

const onKey = (event) => {
  if (hoverCapable.value) return
  if (event.target.matches?.('input, textarea')) return
  if (event.key >= '0' && event.key <= '9') {
    event.preventDefault()
    press(event.key)
  } else if (event.key === 'Backspace') {
    event.preventDefault()
    backspace()
  }
}

onMounted(() => {
  if (hoverCapable.value) focusField()
  else window.addEventListener('keydown', onKey)
})
onUnmounted(() => window.removeEventListener('keydown', onKey))

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

const KEY_CLASS = 'pin-key flex items-center justify-center rounded-full bg-zinc-800 font-light tabular-nums text-zinc-100 transition-colors touch-manipulation select-none hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-40'

const ERASE_CLASS = 'pin-key flex items-center justify-center rounded-full text-zinc-400 transition touch-manipulation hover:text-zinc-100 disabled:opacity-25'

const KEY_POP_FRAMES = [
  { transform: 'scale(0.4)', offset: 0 },
  { transform: 'scale(1.22)', offset: 0.4 },
  { transform: 'scale(0.93)', offset: 0.62 },
  { transform: 'scale(1.07)', offset: 0.82 },
  { transform: 'scale(1)', offset: 1 }
]

const KEY_POP_TIMING = { duration: 440, easing: 'ease-out' }

const DOT_POP_FRAMES = [
  { transform: 'scale(1)' },
  { transform: 'scale(1.6)' },
  { transform: 'scale(1)' }
]

const DOT_POP_TIMING = { duration: 260, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }

const SHAKE_MS = 420
</script>

<template>
  <div v-if="hoverCapable" class="flex justify-center" :class="{ 'pin-shake': shaking }">
    <input
      ref="field"
      :value="digits"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :maxlength="length"
      :disabled="disabled"
      aria-label="Passcode"
      class="pin-field w-44 px-4 py-3 rounded-xl bg-zinc-800 text-2xl text-center tabular-nums tracking-[0.5em] outline-none ring-1 ring-inset ring-zinc-700 transition-colors disabled:opacity-60"
      :class="success ? 'text-green-400' : 'text-zinc-100 focus:ring-zinc-500'"
      @input="onFieldInput"
    />
  </div>

  <div v-else class="flex flex-col items-center">
    <div ref="dots" class="pin-dots flex gap-3.5" :class="{ 'pin-shake': shaking }">
      <span
        v-for="slot in length"
        :key="slot"
        class="w-3.5 h-3.5 rounded-full border-2 transition-colors duration-300"
        :class="dotClass(slot)"
      ></span>
    </div>
    <div class="pin-grid grid grid-cols-3 gap-4 mt-8">
      <button v-for="key in KEYS" :key="key" type="button" :class="KEY_CLASS" :disabled="disabled" @pointerdown="popKey" @click="press(key)">
        {{ key }}
      </button>
      <span></span>
      <button type="button" :class="KEY_CLASS" :disabled="disabled" @pointerdown="popKey" @click="press('0')">0</button>
      <button type="button" :class="ERASE_CLASS" :disabled="disabled || !digits" aria-label="Delete" @pointerdown="popKey" @click="backspace">
        <Delete class="w-6 h-6" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.pin-field {
  -webkit-text-security: disc;
  text-indent: 0.5em;
}

.pin-key {
  width: 4.5rem;
  height: 4.5rem;
  font-size: 1.5rem;
}

.pin-shake {
  animation: pin-shake 0.42s;
}

@keyframes pin-shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-8px); }
  40%, 80% { transform: translateX(8px); }
}

@media (orientation: landscape) and (max-height: 519px) and (max-width: 999px) {
  .pin-dots {
    gap: 0.6rem;
    padding-bottom: 0.5rem;
  }

  .pin-dots span {
    width: 0.75rem;
    height: 0.75rem;
  }

  .pin-grid {
    gap: 0.45rem;
    margin-top: 0.5rem;
  }

  .pin-key {
    width: 2.75rem;
    height: 2.75rem;
    font-size: 1.0625rem;
  }
}

@media (orientation: landscape) and (min-height: 520px) and (hover: none) {
  .pin-dots {
    gap: clamp(0.75rem, 1.6vh, 1.1rem);
  }

  .pin-dots span {
    width: clamp(0.9rem, 1.5vh, 1.15rem);
    height: clamp(0.9rem, 1.5vh, 1.15rem);
  }

  .pin-grid {
    gap: clamp(1rem, 2vh, 1.6rem);
    margin-top: clamp(1.5rem, 3vh, 2.5rem);
  }

  .pin-key {
    width: clamp(5.25rem, 9.5vh, 7rem);
    height: clamp(5.25rem, 9.5vh, 7rem);
    font-size: clamp(1.875rem, 3.4vh, 2.4rem);
  }
}
</style>
