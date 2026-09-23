import { describe, expect, it } from 'vitest'
import { waiverStanding } from './waivers'

const now = new Date('2026-09-23T12:00:00Z')
const annual = { code: 'liability', version: 2, cadence: 'annual' }
const sig = (version: number, signedAt: string) => ({ waiver_code: 'liability', waiver_version: version, signed_at: signedAt })

describe('waiverStanding', () => {
  it('is unsigned with no signature', () => {
    expect(waiverStanding(annual, [], now).standing).toBe('unsigned')
  })

  it('is signed within a year of a current-version signature', () => {
    const r = waiverStanding(annual, [sig(2, '2026-01-10T00:00:00Z')], now)
    expect(r.standing).toBe('signed')
    expect(r.validUntil?.slice(0, 10)).toBe('2027-01-10')
  })

  it('is expired a year on', () => {
    expect(waiverStanding(annual, [sig(2, '2025-09-01T00:00:00Z')], now).standing).toBe('expired')
  })

  it('is outdated when only an older version was signed', () => {
    expect(waiverStanding(annual, [sig(1, '2026-09-01T00:00:00Z')], now).standing).toBe('outdated')
  })

  it('reads the newest current signature, not the first', () => {
    const r = waiverStanding(annual, [sig(2, '2025-01-01T00:00:00Z'), sig(2, '2026-06-01T00:00:00Z')], now)
    expect(r.standing).toBe('signed')
  })

  it('ignores other waivers’ signatures', () => {
    const other = { waiver_code: 'media', waiver_version: 5, signed_at: '2026-09-01T00:00:00Z' }
    expect(waiverStanding(annual, [other], now).standing).toBe('unsigned')
  })

  it('gives a per-event waiver no standing between events', () => {
    const perEvent = { ...annual, cadence: 'per_event' }
    expect(waiverStanding(perEvent, [sig(2, '2026-09-01T00:00:00Z')], now).standing).toBe('unsigned')
  })
})
