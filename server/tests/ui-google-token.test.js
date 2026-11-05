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
  const rejectedFor = (reason) => ({ ...rejected, reason })

  it('says no contact when none arrived', () => {
    expect(googleStatusLines({ lastAccepted: null, lastRejected: null }, now)).toEqual([{
      text: 'No contact from Google since the bridge restarted. Ask Google Home something, then check again.',
      tone: 'none'
    }])
  })

  it('describes an accepted request in plain words', () => {
    expect(googleStatusLines({ lastAccepted: accepted, lastRejected: null }, now)).toEqual([
      { text: 'Google last connected 5 minutes ago.', tone: 'accepted' }
    ])
  })

  it('describes an accepted link step in plain words', () => {
    const linked = { at: '2026-11-05T09:59:58.000Z', route: 'token' }
    expect(googleStatusLines({ lastAccepted: linked, lastRejected: null }, now)).toEqual([
      { text: 'Linked with Google just now.', tone: 'accepted' }
    ])
  })

  it('adds a rejection newer than the last acceptance with what to do', () => {
    expect(googleStatusLines({ lastAccepted: accepted, lastRejected: rejected }, now)).toEqual([
      { text: 'Google last connected 5 minutes ago.', tone: 'accepted' },
      {
        text: 'Google was refused 1 minute ago: it sent an old token. Relink in the Google Home app.',
        tone: 'rejected'
      }
    ])
  })

  it('hides a rejection older than the last acceptance', () => {
    const older = { ...rejected, at: '2026-11-05T09:00:00.000Z' }
    expect(googleStatusLines({ lastAccepted: accepted, lastRejected: older }, now)).toEqual([
      { text: 'Google last connected 5 minutes ago.', tone: 'accepted' }
    ])
  })

  it('explains each rejection reason', () => {
    const textFor = (reason) =>
      googleStatusLines({ lastAccepted: null, lastRejected: rejectedFor(reason) }, now)[0].text
    expect(textFor('wrong client secret')).toBe(
      'Linking failed 1 minute ago: the Client secret in the Google console does not match this token.'
    )
    expect(textFor('invalid grant')).toBe(
      'Linking failed 1 minute ago: the sign-in code expired or was already used. Try linking again.'
    )
    expect(textFor('unsupported grant')).toBe(
      'Linking failed 1 minute ago: Google sent a request this bridge does not support.'
    )
    expect(textFor('bad redirect')).toBe(
      'A sign-in request 1 minute ago did not come from Google, so the bridge refused it.'
    )
    expect(textFor('something new')).toBe('A Google request was refused 1 minute ago (something new).')
  })

  it('reads a timestamp ahead of the browser clock as just now', () => {
    const ahead = { at: '2026-11-05T10:02:00.000Z', route: 'token' }
    expect(googleStatusLines({ lastAccepted: ahead, lastRejected: null }, now)[0].text)
      .toBe('Linked with Google just now.')
  })

  it('shows nothing when the status is hidden', () => {
    expect(googleStatusLines(undefined, now)).toEqual([])
  })
})
