<script setup>
import { computed, onMounted, ref } from 'vue'
import { Check, Lock, ShieldCheck, Trash2 } from '@lucide/vue'
import InfoTip from '../InfoTip.vue'
import { useSettings } from '../../composables/useSettings.js'
import PinPad from './PinPad.vue'

const { data, loadOnce, setPasscode, clearPasscode, lock } = useSettings()

const passcodeSet = computed(() => data.security.passcodeSet)
const editing = ref(false)
const step = ref('enter')
const firstPin = ref('')
const busy = ref(false)
const formError = ref('')
const saved = ref(false)
const confirmingRemove = ref(false)
const removing = ref(false)
const pad = ref(null)

onMounted(loadOnce)

const showForm = computed(() => editing.value || !passcodeSet.value)

const promptTitle = computed(() => {
  if (step.value === 'confirm') return 'Re-enter to confirm'
  return passcodeSet.value ? 'Enter a new passcode' : 'Choose a passcode'
})

const startEditing = () => {
  resetForm()
  saved.value = false
  editing.value = true
}

const cancelEditing = () => {
  editing.value = false
  resetForm()
}

const resetForm = () => {
  step.value = 'enter'
  firstPin.value = ''
  formError.value = ''
  pad.value?.clear()
}

const onSubmit = async (code) => {
  formError.value = ''
  if (step.value === 'enter') {
    firstPin.value = code
    step.value = 'confirm'
    pad.value?.clear()
    return
  }
  if (code !== firstPin.value) {
    startOver('Those didn’t match. Try again.')
    return
  }
  busy.value = true
  try {
    await setPasscode(code)
    editing.value = false
    resetForm()
    saved.value = true
  } catch (error) {
    startOver(error.message)
  }
  busy.value = false
}

const startOver = (message) => {
  formError.value = message
  step.value = 'enter'
  firstPin.value = ''
  pad.value?.shake()
}

const remove = async () => {
  confirmingRemove.value = false
  removing.value = true
  formError.value = ''
  try {
    await clearPasscode()
    saved.value = false
  } catch (error) {
    formError.value = error.message
  }
  removing.value = false
}
</script>

<template>
  <section class="p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2 text-sm text-zinc-400">
        <Lock class="w-4 h-4" />Settings passcode<InfoTip topic="passcode" />
      </div>
      <span
        v-if="passcodeSet"
        class="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400"
      >
        <ShieldCheck class="w-3.5 h-3.5" />On
      </span>
    </div>
    <p class="mb-4 text-sm text-zinc-500 !text-pretty">
      Lock Settings behind a 4-digit passcode.
    </p>

    <div v-if="showForm" class="flex flex-col items-center pt-2 pb-1">
      <p class="text-sm font-medium text-zinc-200">{{ promptTitle }}</p>
      <p class="mb-6 text-xs text-zinc-500">Enter a 4-digit code{{ step === 'confirm' ? ' again' : '' }}.</p>
      <PinPad ref="pad" :busy="busy" @submit="onSubmit" @input="formError = ''" />
      <p v-if="formError" class="mt-5 text-sm text-red-400">{{ formError }}</p>
      <button
        v-if="passcodeSet"
        type="button"
        class="mt-5 text-sm text-zinc-400 hover:text-zinc-200"
        @click="cancelEditing"
      >
        Cancel
      </button>
    </div>

    <template v-else>
      <p v-if="saved" class="flex items-center gap-1.5 mb-4 text-sm text-green-400">
        <Check class="w-4 h-4" />Passcode saved.
      </p>
      <p v-if="formError" class="mb-4 text-sm text-red-400">{{ formError }}</p>
      <div class="flex flex-wrap gap-3">
        <button class="px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700" @click="startEditing">
          Change passcode
        </button>
        <button
          class="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
          :disabled="removing"
          @click="confirmingRemove = true"
        >
          <Trash2 class="w-4 h-4" />{{ removing ? 'Removing…' : 'Remove' }}
        </button>
        <button class="px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700" @click="lock">
          Lock now
        </button>
      </div>
    </template>
  </section>

  <Teleport to="body">
    <div v-if="confirmingRemove" class="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div class="absolute inset-0 bg-black/60" @click="confirmingRemove = false"></div>
      <div class="relative w-full max-w-sm p-5 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
        <div class="flex items-center gap-2 mb-3 text-sm text-zinc-300">
          <Trash2 class="w-4 h-4" />Remove passcode?
        </div>
        <p class="mb-4 text-sm text-zinc-400">
          Anyone on the network will be able to change settings again. You can set a new passcode at
          any time.
        </p>
        <div class="flex justify-end gap-3">
          <button class="px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700" @click="confirmingRemove = false">
            Cancel
          </button>
          <button
            class="px-4 py-2 text-sm font-medium bg-red-600 rounded-xl hover:bg-red-500"
            @click="remove"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
