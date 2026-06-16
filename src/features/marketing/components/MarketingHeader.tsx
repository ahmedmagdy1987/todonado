import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'

/** Public top bar shared by the landing + pricing pages. */
export function MarketingHeader() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  function goAuth(mode: 'signin' | 'signup') {
    // Forward any `from` (set by ProtectedRoute) so login can return the user.
    navigate('/login', { state: { ...((location.state as object | null) ?? {}), mode } })
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/welcome" className="focus-ring rounded-lg" aria-label="Todonado home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-3">
          <Link
            to="/pricing"
            className="focus-ring rounded-lg px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text-primary"
          >
            Pricing
          </Link>
          {session ? (
            <Button size="sm" onClick={() => navigate('/')}>
              Open app
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => goAuth('signin')}>
                Sign in
              </Button>
              <Button size="sm" onClick={() => goAuth('signup')}>
                Start free
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
