export const watchSwipeBack = () => {
  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchend', clearEdgeTouch, { passive: true })
}

export const isSwipeBack = ({ isPop }) => isTouchScreen() && (isPop || edgeTouchIsRecent() || cameBackByReload())

const onTouchStart = (event) => {
  const x = event.touches[0]?.clientX
  edgeTouchAt = x != null && x <= EDGE_PX ? performance.now() : null
}

const clearEdgeTouch = () => { edgeTouchAt = null }

const edgeTouchIsRecent = () => edgeTouchAt != null && performance.now() - edgeTouchAt <= SWIPE_WINDOW_MS

const cameBackByReload = () => {
  if (checkedReload) return false
  checkedReload = true
  return performance.getEntriesByType('navigation')[0]?.type === 'back_forward'
}

const isTouchScreen = () => window.matchMedia('(hover: none)').matches

const EDGE_PX = 30

const SWIPE_WINDOW_MS = 2000

let edgeTouchAt = null

let checkedReload = false
