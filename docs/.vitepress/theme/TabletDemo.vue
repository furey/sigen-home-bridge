<script setup>
import { withBase } from 'vitepress'
import { ref, onMounted, onBeforeUnmount } from 'vue'

const video = ref(null)
const prefersStill = ref(false)

onMounted(() => {
  const el = video.value
  if (!el) return
  el.muted = true
  document.addEventListener('fullscreenchange', settleAfterFullscreen)
  el.addEventListener('webkitendfullscreen', settleAfterFullscreen)
  prefersStill.value = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  if (prefersStill.value) {
    el.removeAttribute('autoplay')
    el.pause()
    return
  }
  el.play?.().catch(() => {})
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', settleAfterFullscreen)
  video.value?.removeEventListener('webkitendfullscreen', settleAfterFullscreen)
})

const openFullscreen = () => {
  const el = video.value
  if (!el) return
  if (document.fullscreenElement) return document.exitFullscreen().catch(() => {})
  el.play?.().catch(() => {})
  if (el.requestFullscreen) return el.requestFullscreen().catch(() => el.webkitEnterFullscreen?.())
  el.webkitEnterFullscreen?.()
}

const settleAfterFullscreen = () => {
  if (document.fullscreenElement) return
  const el = video.value
  if (!el) return
  if (prefersStill.value) return el.pause()
  el.play?.().catch(() => {})
}
</script>

<template>
  <div class="tablet-demo">
    <div class="tablet">
      <button
        type="button"
        class="tablet__screen"
        aria-label="View full screen"
        @click="openFullscreen"
      >
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
        <span class="tablet__hint" aria-hidden="true">
          <span class="tablet__pill">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="m21 3-7 7" /><path d="m3 21 7-7" />
            </svg>
            View full screen
          </span>
        </span>
      </button>
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
  display: block;
  padding: 0;
  border: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
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

.tablet__screen video:fullscreen {
  object-fit: contain;
  background: #000;
}

.tablet__screen:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

.tablet__hint {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.28);
  opacity: 0;
  transition: opacity 200ms ease;
  pointer-events: none;
}

.tablet__pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 999px;
  background: rgba(9, 9, 11, 0.78);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12), 0 8px 24px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  color: #fafafa;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  text-wrap: balance;
}

@media (hover: hover) {
  .tablet__screen:hover .tablet__hint {
    opacity: 1;
  }
}

.tablet__screen:focus-visible .tablet__hint {
  opacity: 1;
}
</style>
