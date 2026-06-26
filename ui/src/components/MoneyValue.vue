<script setup>
import { computed } from 'vue'
import { moneyParts } from '../lib/tariff.js'
import { lerpHex } from '../lib/metrics.js'
import { themeColors } from '../lib/theme.js'

const props = defineProps({
  amount: { type: Number, default: null },
  currency: { type: String, default: 'USD' }
})

const money = computed(() => moneyParts({ amount: props.amount, currency: props.currency }))
const valueColor = computed(() => themeColors[KIND_COLOR[money.value?.kind ?? 'idle']])
const symbolColor = computed(() => lerpHex(valueColor.value, '#000000', SYMBOL_DIM))

const KIND_COLOR = { idle: 'idle', debit: 'cost', credit: 'credit' }

const SYMBOL_DIM = 0.4
</script>

<template>
  <span v-if="money" class="tabular-nums" :style="{ color: valueColor }">
    <span
      v-for="(part, index) in money.parts"
      :key="index"
      :style="part.role === 'symbol' ? { color: symbolColor } : undefined"
    >{{ part.text }}</span>
  </span>
</template>
