export const isHttpUrl = (value) => {
  if (!value) return false
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export const alertWebhookValid = (item) =>
  !item.channels.webhook.enabled || isHttpUrl(item.channels.webhook.url.trim())
