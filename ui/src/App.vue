<script setup>
import { RouterView } from 'vue-router'
import { useSettings } from './composables/useSettings.js'

useSettings().loadOnce()
</script>

<template>
  <RouterView />
</template>
