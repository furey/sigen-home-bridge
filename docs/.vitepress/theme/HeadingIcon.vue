<script setup>
import { VPImage } from 'vitepress/theme'

defineProps({ name: { type: String, required: true } })
</script>

<template>
  <VPImage
    class="heading-icon"
    :image="{ light: `/icons/${name}-light.svg`, dark: `/icons/${name}-dark.svg` }"
  />
</template>
