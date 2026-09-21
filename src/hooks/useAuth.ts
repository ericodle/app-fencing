import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from './auth-context'

// Reads the shared auth state from AuthProvider. Throws outside the provider:
// that is a setup bug, not a runtime state worth silently recovering from.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>')
  return ctx
}
