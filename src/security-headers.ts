// Content-Security-Policy and siblings, added to every SPA response by the
// Cloudflare Worker in src/worker.ts. Its own module so the policy can be
// unit-tested without standing up a Worker runtime.
//
// Directives kept tight on purpose:
//   frame-ancestors 'none'  — clickjacking defense, which matters most on the
//                             manage console
//   object-src 'none'       — no flash / java / pdf-embed surface
//   base-uri 'self'         — pins <base> against rewrite attacks
//
// The wildcard on *.supabase.co is deliberate: the app talks to one project
// today, but rotating the project ref should not be a CSP change. The blast
// radius of "any Supabase project" is small, because what scopes access is the
// anon key and the RLS policies behind it, not the hostname.
//
// geolocation is ALLOWED, unlike the app this was ported from, and it is the
// one interesting line here: the profile page offers "use my current location"
// to set a home area for the meetup planner. It is self-only — a third-party
// frame cannot ask on the app's behalf — and the coordinates are rounded to
// about 100 m before they are stored.
//
// 'unsafe-inline' on style-src is required because Tailwind emits inline style
// attributes on some compiled paths. Removing it needs a nonce or hash pass,
// which is a separate job.

const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src':     ["'self'"],
  'script-src':      ["'self'"],
  'style-src':       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'img-src':         ["'self'", 'data:', 'blob:', 'https://*.supabase.co'],
  'font-src':        ["'self'", 'https://fonts.gstatic.com'],
  'connect-src':     ["'self'", 'https://*.supabase.co', 'https://*.workers.dev'],
  'frame-src':       ["'none'"],
  'worker-src':      ["'self'"],
  'manifest-src':    ["'self'"],
  'frame-ancestors': ["'none'"],
  'base-uri':        ["'self'"],
  'form-action':     ["'self'"],
  'object-src':      ["'none'"],
}

export const CSP_HEADER = Object.entries(CSP_DIRECTIVES)
  .map(([directive, values]) => `${directive} ${values.join(' ')}`)
  .join('; ')

export const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['Content-Security-Policy', CSP_HEADER],
  ['X-Content-Type-Options',  'nosniff'],
  ['X-Frame-Options',         'DENY'],
  ['Referrer-Policy',         'strict-origin-when-cross-origin'],
  // camera and microphone are off; geolocation is same-origin only, for the
  // home-area picker.
  ['Permissions-Policy',      'camera=(), microphone=(), geolocation=(self)'],
]

export function applySecurityHeaders(headers: Headers): Headers {
  const out = new Headers(headers)
  for (const [name, value] of SECURITY_HEADERS) out.set(name, value)
  return out
}
