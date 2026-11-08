<script setup>
import { withBase } from 'vitepress'
import { onMounted, ref } from 'vue'

const video = ref(null)

onMounted(() => {
  const el = video.value
  if (!el) return
  el.muted = true
  const prefersStill = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (prefersStill) return
  el.play?.().catch(() => {})
})
</script>

<template>
  <figure class="install-video">
    <video
      ref="video"
      :src="withBase('/install-demo.mp4')"
      :poster="withBase('/install-demo-poster.jpg')"
      aria-label="The one-line install in a terminal, from the curl command to the dashboard address"
      muted
      loop
      playsinline
      controls
      preload="metadata"
      width="1280"
      height="800"
    />
  </figure>
</template>

<style scoped>
.install-video {
  margin: 16px 0 24px;
}

.install-video video {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1280 / 800;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: #09090b;
}
</style>
