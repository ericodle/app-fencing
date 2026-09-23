import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/AuthProvider'
import { AppShell } from './components/layout/AppShell'
import { AdminShell } from './components/layout/AdminShell'
import {
  ProtectedRoute, RequireActive, AdminRoute, CoachOrAdminRoute, HomeRedirect,
} from './components/layout/guards'

import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { PendingPage } from './pages/PendingPage'
import { DashboardPage } from './pages/DashboardPage'
import { CalendarPage } from './pages/CalendarPage'
import { EventDetailPage } from './pages/EventDetailPage'
import { RosterPage } from './pages/RosterPage'
import { ProfilePage } from './pages/ProfilePage'
import { ContactPage } from './pages/ContactPage'
import { RecordsPage } from './pages/RecordsPage'
import { BoutsPage } from './pages/BoutsPage'
import { ResultsPage } from './pages/ResultsPage'
import { AttendanceHistoryPage } from './pages/AttendanceHistoryPage'
import { BookingsPage } from './pages/BookingsPage'

import { ManagePage } from './pages/admin/ManagePage'
import { AdminMembersPage } from './pages/admin/AdminMembersPage'
import { AdminEventsPage } from './pages/admin/AdminEventsPage'
import { AdminEventDetailPage } from './pages/admin/AdminEventDetailPage'
import { AdminPaymentsPage } from './pages/admin/AdminPaymentsPage'
import { AdminWaiversPage } from './pages/admin/AdminWaiversPage'
import { AdminAttendancePage } from './pages/admin/AdminAttendancePage'
import { AdminVenuesPage } from './pages/admin/AdminVenuesPage'
import { AdminPricesPage } from './pages/admin/AdminPricesPage'
import { AdminAuditPage } from './pages/admin/AdminAuditPage'

// The route tree, and with it the access model.
//
// The nesting IS the policy, read top to bottom:
//   ProtectedRoute   — signed in
//     RequireActive  — approved by a coach (/pending sits outside this, which
//                      is the whole reason it can be reached)
//       AppShell     — member chrome
//       CoachOrAdmin — the manage console
//         AdminRoute — the parts only an admin may write
//
// Every guard is also enforced by an RLS policy in the database. These are
// navigation, not security: a member who types a URL gets bounced, and a member
// who calls PostgREST directly gets nothing back.

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<ProtectedRoute />}>
            {/* Outside RequireActive on purpose: this is where an account that
                is not yet approved actually lands. */}
            <Route path="/pending" element={<PendingPage />} />

            <Route element={<RequireActive />}>
              <Route element={<AppShell />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/calendar/:id" element={<EventDetailPage />} />
                <Route path="/bookings" element={<BookingsPage />} />
                <Route path="/roster" element={<RosterPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/records" element={<RecordsPage />}>
                  <Route index element={<Navigate to="bouts" replace />} />
                  <Route path="bouts" element={<BoutsPage />} />
                  <Route path="results" element={<ResultsPage />} />
                  <Route path="history" element={<AttendanceHistoryPage />} />
                </Route>
              </Route>

              <Route element={<CoachOrAdminRoute />}>
                <Route element={<AdminShell />}>
                  <Route path="/manage" element={<ManagePage />} />
                  <Route path="/manage/members" element={<AdminMembersPage />} />
                  <Route path="/manage/events" element={<AdminEventsPage />} />
                  <Route path="/manage/events/:id" element={<AdminEventDetailPage />} />
                  <Route path="/manage/payments" element={<AdminPaymentsPage />} />
                  <Route path="/manage/attendance" element={<AdminAttendancePage />} />

                  <Route element={<AdminRoute />}>
                    <Route path="/manage/venues" element={<AdminVenuesPage />} />
                    <Route path="/manage/prices" element={<AdminPricesPage />} />
                    <Route path="/manage/waivers" element={<AdminWaiversPage />} />
                    <Route path="/manage/audit" element={<AdminAuditPage />} />
                  </Route>
                </Route>
              </Route>
            </Route>
          </Route>

          <Route path="/" element={<HomeRedirect />} />
          {/* Anything else goes home rather than to a 404: every real route in
              this app is behind a guard, so an unknown path is far more often a
              stale bookmark than a typo. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
