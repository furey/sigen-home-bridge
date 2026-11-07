import { PAGE_REVEAL, isRevealArrival, revealDelaysOf } from '../lib/pageReveal.js'
import { latestArrival } from '../lib/revealArrival.js'

export const vReveal = {
  mounted: (el, { value }) => requestReveal({ el, hold: holdOf(value) }),
  updated: (el, { value, oldValue }) => {
    if (keyOf(value) !== keyOf(oldValue)) requestReveal({ el, hold: holdOf(value) })
  }
}

const pending = []

const requestReveal = ({ el, hold }) => {
  const arrival = latestArrival()
  if (!isRevealArrival({ arrival, nowMs: performance.now() })) return
  pending.push({ el, hold })
  if (pending.length === 1) queueMicrotask(flushReveal)
}

const flushReveal = () => {
  latestArrival().revealed = true
  const targets = pending.splice(0)
  const plan = PAGE_REVEAL
  if (prefersReducedMotion()) return
  const items = revealItemsOf(targets)
  const delays = revealDelaysOf({ boxes: items.map(boxOf), viewportHeight: window.innerHeight, stepMs: plan.stepMs })
  items.forEach((item, index) => {
    if (delays[index] !== null) slideIn({ el: item, delay: delays[index], plan })
  })
}

const revealItemsOf = (targets) => {
  const holds = new Map(targets.filter(({ el }) => el.isConnected).map(({ el, hold }) => [el, hold]))
  const roots = [...holds.keys()]
  const outermost = roots.filter((el) => !roots.some((other) => other !== el && other.contains(el)))
  const expand = (el) => [...el.children].slice(holds.get(el) ?? 0)
    .flatMap((child) => (holds.has(child) ? expand(child) : [child]))
    .filter(isMovable)
  return outermost.flatMap(expand)
}

const isMovable = (el) => !['fixed', 'sticky'].includes(getComputedStyle(el).position)

const boxOf = (el) => {
  const { top, height } = el.getBoundingClientRect()
  return { top, height }
}

const slideIn = ({ el, delay, plan }) => el.animate(
  [{ opacity: plan.fromOpacity, translate: `0 ${plan.offsetPx}px` }, { opacity: 1, translate: '0 0' }],
  { duration: plan.durationMs, delay, easing: plan.easing, fill: 'backwards' }
)

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const holdOf = (value) => value?.hold ?? 0

const keyOf = (value) => value?.key
