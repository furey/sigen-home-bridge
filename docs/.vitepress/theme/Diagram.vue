<script setup>
import { VPImage } from 'vitepress/theme'

defineProps({
  name: { type: String, required: true },
  alt: { type: String, required: true }
})

const sources = (file) => ({ light: `/diagrams/${file}-light.svg`, dark: `/diagrams/${file}-dark.svg` })
</script>

<template>
  <figure class="diagram">
    <div class="diagram__wide">
      <VPImage :image="{ ...sources(name), alt }" />
    </div>
    <div class="diagram__phone">
      <VPImage :image="{ ...sources(`${name}-phone`), alt }" />
    </div>
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

.diagram__phone {
  display: none;
}

@media (max-width: 639px) {
  .diagram__wide {
    display: none;
  }

  .diagram__phone {
    display: block;
  }
}
</style>
