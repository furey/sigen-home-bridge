export const MIN_VISIBLE_MS = 800

export const delay = (ms = MIN_VISIBLE_MS) =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const withMinDuration = async (promise, ms = MIN_VISIBLE_MS) => {
  const [result] = await Promise.all([promise, delay(ms)])
  return result
}
