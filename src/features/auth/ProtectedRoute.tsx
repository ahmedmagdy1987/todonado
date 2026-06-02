import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullScreenLoader } from '@/components/common/FullScreenLoader'
import { useAuth } from './auth-context'

/**
 * Gate for authenticated areas. Unauthenticated users are redirected to
 * /login, preserving where they were headed so we can return them after.
 */
export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <FullScreenLoader label="Booting your command center…" />
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
