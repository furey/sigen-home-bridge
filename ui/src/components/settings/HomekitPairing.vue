<script setup>
import { computed, onMounted, ref } from 'vue'
import { Check, Copy } from '@lucide/vue'
import { useSession } from '../../composables/useSession.js'

const props = defineProps({ pin: { type: String, default: '' } })

const pairing = ref(null)
const copied = ref(false)

const draftPin = computed(() => props.pin.trim())
const activePin = computed(() => pairing.value?.pin ?? '')
const displayPin = computed(() => draftPin.value || activePin.value)
const unsaved = computed(() =>
  Boolean(pairing.value && draftPin.value && draftPin.value !== activePin.value))

onMounted(async () => {
  try {
    pairing.value = await (await fetch('/api/homekit/pairing', {
      headers: useSession().authHeaders()
    })).json()
  } catch {
    pairing.value = { uri: '', pin: '', qr: '' }
  }
})

const copyUri = async () => {
  try {
    await navigator.clipboard.writeText(pairing.value.uri)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {}
}
</script>

<template>
  <div v-if="pairing" class="p-4 rounded-xl bg-zinc-900 ring-1 ring-zinc-800">
    <div v-if="pairing.qr" class="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <img
        :src="pairing.qr"
        alt="HomeKit pairing QR code"
        width="160"
        height="160"
        class="w-40 h-40 p-2 bg-white shrink-0 rounded-xl"
      />
      <div class="flex-1 min-w-0 space-y-3 text-center sm:text-left">
        <div>
          <span class="block text-xs text-zinc-500">Pairing code</span>
          <span class="text-2xl font-semibold tracking-wider tabular-nums text-zinc-100">{{ displayPin }}</span>
        </div>
        <p v-if="unsaved" class="text-xs text-amber-400">
          Not active yet. Save and restart the bridge to use this code; the QR still pairs with
          <span class="tabular-nums">{{ activePin }}</span> until then.
        </p>
        <p v-else class="text-xs text-zinc-500">
          Scan the code in Apple Home, or enter the pairing code by hand.
        </p>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
          @click="copyUri"
        >
          <component :is="copied ? Check : Copy" class="w-4 h-4" :class="{ 'text-green-400': copied }" />
          {{ copied ? 'Copied' : 'Copy setup URI' }}
        </button>
      </div>
    </div>
    <p v-else class="text-sm text-amber-400">
      Pairing details are unavailable; HomeKit may not have started. Check the container logs for the QR code and pairing code.
    </p>
  </div>
</template>
