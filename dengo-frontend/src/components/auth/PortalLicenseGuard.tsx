import { Navigate, Outlet } from 'react-router-dom'
import { useLicenseStore } from '../../store'

// Blocks direct navigation to a /portal/* admin screen once this instance's
// teacher-portal module is confirmed off (see LicenseConfig / Sidebar.tsx,
// which already hides the link for this case) — `loaded` gates the check so
// a visitor isn't bounced away during the brief window before the license
// fetch resolves (the store defaults to enabled until then, same fail-open
// as the backend's own DEFAULT_LICENSE).
export default function PortalLicenseGuard() {
  const { maestrosEnabled, loaded } = useLicenseStore()
  if (loaded && !maestrosEnabled) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
