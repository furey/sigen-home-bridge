<script setup>
import { VPImage } from 'vitepress/theme'

defineProps({
  name: { type: String, required: true },
  alt: { type: String, required: true }
})
</script>

<template>
  <figure class="diagram">
    <VPImage
      :image="{ light: `/diagrams/${name}-light.svg`, dark: `/diagrams/${name}-dark.svg`, alt }"
    />
  </figure>
</template>

<style scoped>
.diagram {
  margin: 24px auto;
  max-width: 680px;
}

.diagram :deep(img) {
  display: block;
  width: 100%;
  height: auto;
}
</style>
