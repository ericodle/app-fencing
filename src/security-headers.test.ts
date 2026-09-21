import { describe, it, expect } from 'vitest'
import { CSP_HEADER, SECURITY_HEADERS, applySecurityHeaders } from './security-headers'

describe('the content security policy', () => {
  it('refuses to be framed, which is what protects the manage console', () => {
    expect(CSP_HEADER).toContain("frame-ancestors 'none'")
    expect(SECURITY_HEADERS).toContainEqual(['X-Frame-Options', 'DENY'])
  })

  it('allows no plugin surface and no base rewrite', () => {
    expect(CSP_HEADER).toContain("object-src 'none'")
    expect(CSP_HEADER).toContain("base-uri 'self'")
  })

  it('lets the app reach Supabase and nothing else it was not told about', () => {
    expect(CSP_HEADER).toContain('connect-src')
    expect(CSP_HEADER).toContain('https://*.supabase.co')
    expect(CSP_HEADER).not.toContain('connect-src *')
  })

  it('never allows inline script, whatever it allows for style', () => {
    const scriptSrc = CSP_HEADER.split('; ').find(d => d.startsWith('script-src'))!
    expect(scriptSrc).not.toContain('unsafe-inline')
    expect(scriptSrc).not.toContain('unsafe-eval')
  })

  it('allows geolocation to itself, for the home-area picker, and to nobody else', () => {
    const permissions = SECURITY_HEADERS.find(([name]) => name === 'Permissions-Policy')![1]
    expect(permissions).toContain('geolocation=(self)')
    expect(permissions).toContain('camera=()')
    expect(permissions).toContain('microphone=()')
  })
})

describe('applySecurityHeaders', () => {
  it('adds every header to a response', () => {
    const out = applySecurityHeaders(new Headers())
    for (const [name, value] of SECURITY_HEADERS) {
      expect(out.get(name)).toBe(value)
    }
  })

  it('keeps the headers the asset server already set', () => {
    const out = applySecurityHeaders(new Headers({ 'Content-Type': 'text/html', ETag: '"abc"' }))
    expect(out.get('Content-Type')).toBe('text/html')
    expect(out.get('ETag')).toBe('"abc"')
  })

  it('overwrites a weaker policy rather than appending to it', () => {
    const out = applySecurityHeaders(new Headers({ 'X-Frame-Options': 'SAMEORIGIN' }))
    expect(out.get('X-Frame-Options')).toBe('DENY')
  })

  it('does not mutate the headers it was handed', () => {
    const original = new Headers()
    applySecurityHeaders(original)
    expect(original.get('Content-Security-Policy')).toBeNull()
  })
})
