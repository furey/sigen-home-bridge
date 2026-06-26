import { describe, expect, it } from 'vitest'
import { subnetPrefixes } from '../discover.js'

describe('subnetPrefixes', () => {
  it('derives the /24 prefix from a LAN interface', () => {
    const interfaces = {
      en0: [{ family: 'IPv4', internal: false, address: '192.168.1.42' }]
    }
    expect(subnetPrefixes(interfaces)).toEqual(['192.168.1'])
  })

  it('skips loopback and IPv6 addresses', () => {
    const interfaces = {
      lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
      en0: [
        { family: 'IPv6', internal: false, address: 'fe80::1' },
        { family: 'IPv4', internal: false, address: '10.0.0.5' }
      ]
    }
    expect(subnetPrefixes(interfaces)).toEqual(['10.0.0'])
  })

  it('dedupes interfaces on the same subnet and keeps distinct ones', () => {
    const interfaces = {
      en0: [{ family: 'IPv4', internal: false, address: '192.168.1.42' }],
      en1: [{ family: 'IPv4', internal: false, address: '192.168.1.99' }],
      eth0: [{ family: 'IPv4', internal: false, address: '172.16.0.2' }]
    }
    expect(subnetPrefixes(interfaces)).toEqual(['192.168.1', '172.16.0'])
  })

  it('handles interfaces with no addresses', () => {
    expect(subnetPrefixes({ en0: undefined })).toEqual([])
  })
})
