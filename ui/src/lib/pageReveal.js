export const PAGE_REVEAL = {
  durationMs: 350,
  stepMs: 45,
  maxSteps: 4,
  offsetPx: 6,
  arrivalWindowMs: 1500,
  easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)'
}

export const REPEAT_REVEAL = {
  durationMs: 160,
  stepMs: 0,
  offsetPx: 0,
  fromOpacity: 0.5
}

export const revealPlanOf = ({ repeat }) => (repeat
  ? { ...PAGE_REVEAL, ...REPEAT_REVEAL }
  : { ...PAGE_REVEAL, fromOpacity: 0 })

export const isRevealArrival = ({ arrival, nowMs, windowMs = PAGE_REVEAL.arrivalWindowMs }) => Boolean(arrival)
  && arrival.fresh
  && !arrival.revealed
  && nowMs - arrival.at <= windowMs

export const revealDelaysOf = ({
  boxes,
  viewportHeight,
  stepMs = PAGE_REVEAL.stepMs,
  maxSteps = PAGE_REVEAL.maxSteps
}) => {
  let step = 0
  return boxes.map(({ top, height }) => {
    if (height <= 0 || top >= viewportHeight || top + height <= 0) return null
    return Math.min(step++, maxSteps) * stepMs
  })
}
