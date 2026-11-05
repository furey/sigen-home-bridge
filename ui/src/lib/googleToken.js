export const generateGoogleToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const googleTokenProblem = (token) => {
  const trimmed = token.trim()
  if (!trimmed) return ''
  if (trimmed === PUBLIC_DEFAULT_TOKEN) {
    return 'The auth token cannot be the public default. Use Generate.'
  }
  if (trimmed.length < MIN_TOKEN_LENGTH) {
    return `The auth token must be at least ${MIN_TOKEN_LENGTH} characters. Use Generate.`
  }
  return ''
}

export const copyText = async (text) => {
  if (await copyWithClipboard(text)) return true
  return copyWithTextarea(text)
}

export const googleStatusLines = (status, now = Date.now()) => {
  if (!status) return []
  const { lastAccepted, lastRejected } = status
  if (!lastAccepted && !lastRejected) return [NO_REQUEST_LINE]
  const lines = lastAccepted ? [acceptedLine(lastAccepted, now)] : []
  if (rejectedIsNewer(lastRejected, lastAccepted)) lines.push(rejectedLine(lastRejected, now))
  return lines
}

const copyWithClipboard = async (text) => {
  if (!globalThis.navigator?.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const copyWithTextarea = (text) => {
  if (!globalThis.document?.body) return false
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  const previousFocus = document.activeElement
  document.body.appendChild(textarea)
  try {
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
    previousFocus?.focus?.()
  }
}

const acceptedLine = ({ at, route }, now) =>
  ({ text: `Last accepted: ${relativeTime(Date.parse(at), now)} (${route})`, tone: 'accepted' })

const rejectedLine = ({ at, reason }, now) =>
  ({ text: `Last rejected: ${relativeTime(Date.parse(at), now)}: ${reason}`, tone: 'rejected' })

const rejectedIsNewer = (rejected, accepted) =>
  Boolean(rejected) && (!accepted || Date.parse(rejected.at) > Date.parse(accepted.at))

const relativeTime = (then, now) => {
  const seconds = Math.round((then - now) / 1000)
  const unit = RELATIVE_UNITS.find(({ limit }) => Math.abs(seconds) < limit)
    ?? RELATIVE_UNITS.at(-1)
  return RELATIVE_FORMAT.format(Math.round(seconds / unit.seconds), unit.name)
}

const NO_REQUEST_LINE = { text: 'No request from Google since the bridge started', tone: 'none' }

const TOKEN_BYTES = 32

const MIN_TOKEN_LENGTH = 32

const PUBLIC_DEFAULT_TOKEN = 'sigen-home-bridge-token'

const RELATIVE_UNITS = [
  { name: 'second', seconds: 1, limit: 60 },
  { name: 'minute', seconds: 60, limit: 3600 },
  { name: 'hour', seconds: 3600, limit: 86400 },
  { name: 'day', seconds: 86400, limit: Infinity }
]

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat('en-AU', { numeric: 'auto' })
