import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { PageLoading } from '../ui/Spinner'

// The route guards, in one file because they are one decision tree and reading
// them apart is harder than reading them together.
//
// The order matters and is load-bearing:
//   signed in?  →  account active?  →  role allows this route?
// Each guard assumes the one above it has already passed, which is why
// RequireActive can read `profile` without a null check for the signed-out case.

/** Signed in at all. Everything below assumes this has passed. */
export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoading />
  if (!session) {
    // Remember where they were headed, so signing in lands them there rather
    // than dumping everyone on the dashboard.
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <Outlet />
}

/** Approved by a coach. A pending or rejected account has a session and no
 *  business anywhere but /pending. */
export function RequireActive() {
  const { profile, loading } = useAuth()
  if (loading || !profile) return <PageLoading />
  if (profile.status !== 'active') return <Navigate to="/pending" replace />
  return <Outlet />
}

export function AdminRoute() {
  const { profile, loading } = useAuth()
  if (loading || !profile) return <PageLoading />
  if (profile.role !== 'admin') return <Navigate to="/dashboard" replace />
  return <Outlet />
}

export function CoachOrAdminRoute() {
  const { profile, loading } = useAuth()
  if (loading || !profile) return <PageLoading />
  if (profile.role !== 'admin' && profile.role !== 'coach') return <Navigate to="/dashboard" replace />
  return <Outlet />
}

/** Where "/" goes, which depends on who is asking. */
export function HomeRedirect() {
  const { session, profile, loading } = useAuth()
  if (loading) return <PageLoading />
  if (!session) return <Navigate to="/login" replace />
  if (!profile || profile.status !== 'active') return <Navigate to="/pending" replace />
  return <Navigate to="/dashboard" replace />
}
