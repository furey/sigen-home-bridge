<script setup>
import { withBase } from 'vitepress'
import { ref, onMounted } from 'vue'

const video = ref(null)

onMounted(() => {
  const el = video.value
  if (!el) return
  el.muted = true
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  if (reduce?.matches) {
    el.removeAttribute('autoplay')
    el.pause()
    return
  }
  el.play?.().catch(() => {})
})
</script>

<template>
  <div class="tablet-demo">
    <div class="tablet">
      <div class="tablet__screen">
        <video
          ref="video"
          :poster="withBase('/demo-poster.jpg')"
          autoplay
          loop
          muted
          playsinline
          preload="metadata"
          aria-label="A tour of the sigen-home-bridge dashboard, trends, and settings"
        >
          <source :src="withBase('/demo.mp4')" type="video/mp4" />
        </video>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tablet-demo {
  display: flex;
  justify-content: center;
  width: 100%;
}

.tablet {
  --bezel: clamp(11px, 3.2%, 18px);
  position: relative;
  width: 100%;
  max-width: 520px;
  padding: var(--bezel);
  border-radius: 30px;
  background: linear-gradient(158deg, #26262b 0%, #141417 42%, #0b0b0e 100%);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.06),
    inset 0 1px 1px rgba(255, 255, 255, 0.09),
    0 34px 60px -24px rgba(0, 0, 0, 0.8),
    0 12px 26px -14px rgba(0, 0, 0, 0.65);
}

.tablet::before {
  content: "";
  position: absolute;
  top: calc(var(--bezel) / 2);
  left: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle at 35% 32%, #3b3b45, #08080a 75%);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.tablet__screen {
  position: relative;
  aspect-ratio: 1194 / 834;
  width: 100%;
  border-radius: 13px;
  overflow: hidden;
  background: #09090b;
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.7),
    inset 0 0 24px rgba(0, 0, 0, 0.45);
}

.tablet__screen::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.07),
    rgba(255, 255, 255, 0) 38%
  );
}

.tablet__screen video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
