import { describe, expect, it } from 'vitest'
import { parseNewMember } from './new-member'

const valid = { email: 'yiling@example.com', name: 'Yiling Ku', role: 'coach', password: 'en-garde-8' }

describe('parseNewMember', () => {
  it('accepts a complete request and normalizes the address', () => {
    expect(parseNewMember({ ...valid, email: '  YiLing@Example.com ', name: ' Yiling Ku ' })).toEqual({
      ok: true,
      value: { email: 'yiling@example.com', name: 'Yiling Ku', role: 'coach', password: 'en-garde-8' },
    })
  })

  it('defaults the role to fencer', () => {
    const { role: _omitted, ...rest } = valid
    void _omitted
    const parsed = parseNewMember(rest)
    expect(parsed.ok && parsed.value.role).toBe('fencer')
  })

  it.each([
    ['a non-object body', null],
    ['a missing email', { ...valid, email: undefined }],
    ['an email without a domain', { ...valid, email: 'yiling@' }],
    ['a blank name', { ...valid, name: '   ' }],
    ['a name over 120 characters', { ...valid, name: 'x'.repeat(121) }],
    ['an unknown role', { ...valid, role: 'owner' }],
    ['a seven-character password', { ...valid, password: '1234567' }],
  ])('refuses %s', (_label, body) => {
    expect(parseNewMember(body).ok).toBe(false)
  })

  it('does not trim the password', () => {
    const parsed = parseNewMember({ ...valid, password: ' spaced  ' })
    expect(parsed.ok && parsed.value.password).toBe(' spaced  ')
  })
})
