import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'

/** Public footer shared by the landing + pricing pages. */
export function MarketingFooter() {
  return (
    <footer className="border-t border-white/5 bg-surface/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <Logo />
          <p className="text-xs text-text-muted">Plan a realistic day. Execute with focus.</p>
        </div>
        <nav className="flex items-center gap-4 text-sm text-text-muted">
          <Link to="/welcome" className="focus-ring rounded px-1 hover:text-text-primary">
            Home
          </Link>
          <Link to="/pricing" className="focus-ring rounded px-1 hover:text-text-primary">
            Pricing
          </Link>
          <Link to="/login" className="focus-ring rounded px-1 hover:text-text-primary">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  )
}
