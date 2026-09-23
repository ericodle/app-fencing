// The shape of a "create an account" request, checked before anything touches
// Auth. Import-free so the unit suite can run it under Node and the edge
// function can run it under Deno.

export const MEMBER_ROLES = ['fencer', 'coach', 'admin'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

// Matches the reset-password form. The Auth server's own floor is lower; an
// admin-chosen password is handed over by message, so it should not be the
// weakest one the club has.
export const MIN_PASSWORD_LENGTH = 8

export interface NewMember {
  email: string
  name: string
  role: MemberRole
  password: string
}

export type Parsed =
  | { ok: true; value: NewMember }
  | { ok: false; error: string }

export function parseNewMember(input: unknown): Parsed {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'Expected a JSON object.' }
  }
  const body = input as Record<string, unknown>

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  // Deliberately loose: the Auth server is the real judge of an address, and
  // this only has to catch a name typed into the wrong box.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'That does not look like an email address.' }
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name === '') return { ok: false, error: 'A name is required.' }
  if (name.length > 120) return { ok: false, error: 'That name is too long.' }

  const role = body.role ?? 'fencer'
  if (!MEMBER_ROLES.includes(role as MemberRole)) {
    return { ok: false, error: `Role must be one of ${MEMBER_ROLES.join(', ')}.` }
  }

  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `The password needs at least ${MIN_PASSWORD_LENGTH} characters.` }
  }

  return { ok: true, value: { email, name, role: role as MemberRole, password } }
}
