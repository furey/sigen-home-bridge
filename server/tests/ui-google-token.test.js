import { afterEach, describe, expect, it, vi } from 'vitest'

const { copyText, generateGoogleToken, googleStatusLines, googleTokenProblem } =
  await import('../../ui/src/lib/googleToken.js')

const fakeDocument = (copied) => {
  const textarea = {
    style: {}, setAttribute: vi.fn(), select: vi.fn(), setSelectionRange: vi.fn(), remove: vi.fn()
  }
  const activeElement = { focus: vi.fn() }
  return {
    textarea,
    activeElement,
    createElement: vi.fn(() => textarea),
    body: { appendChild: vi.fn() },
    execCommand: vi.fn(() => copied)
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('generating a google token', () => {
  it('returns 64 hex characters', () => {
    expect(generateGoogleToken()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns a new value each time', () => {
    expect(generateGoogleToken()).not.toBe(generateGoogleToken())
  })
})

describe('google token problems', () => {
  it('accepts a blank field, which keeps the stored token', () => {
    expect(googleTokenProblem('  ')).toBe('')
  })

  it('rejects the public default', () => {
    expect(googleTokenProblem('sigen-home-bridge-token')).toMatch(/public default/)
  })

  it('rejects a short token', () => {
    expect(googleTokenProblem('short')).toMatch(/32 characters/)
  })

  it('accepts a generated token', () => {
    expect(googleTokenProblem(generateGoogleToken())).toBe('')
  })
})

describe('copying text', () => {
  it('uses the clipboard API when present', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await copyText('abc')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('abc')
  })

  it('falls back to a hidden textarea without the clipboard API', async () => {
    const fake = fakeDocument(true)
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('document', fake)
    expect(await copyText('abc')).toBe(true)
    expect(fake.textarea.value).toBe('abc')
    expect(fake.execCommand).toHaveBeenCalledWith('copy')
    expect(fake.textarea.remove).toHaveBeenCalled()
  })

  it('selects the full range and restores focus for iOS', async () => {
    const fake = fakeDocument(true)
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('document', fake)
    await copyText('abcdef')
    expect(fake.textarea.setSelectionRange).toHaveBeenCalledWith(0, 6)
    expect(fake.activeElement.focus).toHaveBeenCalled()
  })

  it('reports failure when neither way copies', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied')
    })
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('document', fakeDocument(false))
    expect(await copyText('abc')).toBe(false)
  })
})

describe('google status lines', () => {
  const now = Date.parse('2026-11-05T10:00:00.000Z')
  const accepted = { at: '2026-11-05T09:55:00.000Z', route: 'fulfillment' }
  const rejected = { at: '2026-11-05T09:59:00.000Z', route: 'fulfillment', reason: 'wrong token' }

  it('says no request when none arrived', () => {
    expect(googleStatusLines({ lastAccepted: null, lastRejected: null }, now)).toEqual([
      { text: 'No request from Google since the bridge started', tone: 'none' }
    ])
  })

  it('shows the last acceptance with its route', () => {
    expect(googleStatusLines({ lastAccepted: accepted, lastRejected: null }, now)).toEqual([
      { text: 'Last accepted: 5 minutes ago (fulfillment)', tone: 'accepted' }
    ])
  })

  it('adds a rejection newer than the last acceptance', () => {
    expect(googleStatusLines({ lastAccepted: accepted, lastRejected: rejected }, now)).toEqual([
      { text: 'Last accepted: 5 minutes ago (fulfillment)', tone: 'accepted' },
      { text: 'Last rejected: 1 minute ago: wrong token', tone: 'rejected' }
    ])
  })

  it('hides a rejection older than the last acceptance', () => {
    const older = { ...rejected, at: '2026-11-05T09:00:00.000Z' }
    expect(googleStatusLines({ lastAccepted: accepted, lastRejected: older }, now)).toEqual([
      { text: 'Last accepted: 5 minutes ago (fulfillment)', tone: 'accepted' }
    ])
  })

  it('shows a rejection alone when nothing was accepted', () => {
    expect(googleStatusLines({ lastAccepted: null, lastRejected: rejected }, now)).toEqual([
      { text: 'Last rejected: 1 minute ago: wrong token', tone: 'rejected' }
    ])
  })

  it('shows nothing when the status is hidden', () => {
    expect(googleStatusLines(undefined, now)).toEqual([])
  })
})
