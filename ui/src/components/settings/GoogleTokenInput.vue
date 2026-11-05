<script setup>
import { ref, watch } from 'vue'
import { KeyRound } from '@lucide/vue'
import { copyText, generateGoogleToken } from '../../lib/googleToken.js'

const token = defineModel({ type: String, default: '' })

defineProps({
  placeholder: { type: String, default: 'auth token' },
  saveStep: { type: String, default: 'save here' },
  inputId: { type: String, default: 'google-auth-token' }
})

const tokenVisible = ref(false)
const copyOutcome = ref('')

watch(token, (value) => {
  if (value) return
  tokenVisible.value = false
  copyOutcome.value = ''
})

const generateToken = async () => {
  const generated = generateGoogleToken()
  token.value = generated
  tokenVisible.value = true
  copyOutcome.value = (await copyText(generated)) ? 'copied' : 'manual'
}
</script>

<template>
  <div class="flex gap-2">
    <input :id="inputId" v-model="token" :type="tokenVisible ? 'text' : 'password'" autocomplete="off"
      spellcheck="false" :placeholder="placeholder"
      class="w-full min-w-0 px-3 py-2 rounded-lg bg-zinc-800"
      :class="{ 'font-mono text-sm': tokenVisible }" />
    <button type="button"
      class="flex shrink-0 items-center gap-1.5 rounded-xl bg-zinc-800 px-4 py-2 text-sm
        hover:bg-zinc-700"
      @click="generateToken">
      <KeyRound class="w-4 h-4" />Generate
    </button>
  </div>
  <div v-if="copyOutcome"
    class="p-3 mt-3 space-y-1 rounded-lg bg-green-500/5 ring-1 ring-green-500/20">
    <p class="text-xs font-medium text-green-400 text-balance">
      {{ copyOutcome === 'copied' ? 'Token copied' : 'Copy it from the field' }}
    </p>
    <p class="text-xs text-zinc-400 text-pretty">
      Paste the same value into Client secret in the Google Home Developer Console. Then
      {{ saveStep }} and relink in the Google Home app.
    </p>
  </div>
</template>
