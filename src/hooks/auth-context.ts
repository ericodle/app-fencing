import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile } from '../types/db'

// Split from AuthProvider.tsx so react-refresh works cleanly — its "only
// export components" rule trips when a context is exported alongside a
// component from the same module.

export interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
  /** Re-fetch the signed-in member's profile into context. Callers that mutate
   *  the profile server-side — accepting terms, an admin approving an account —
   *  must call this before relying on the new value, or the route guards keep
   *  reading the stale cached one. */
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
