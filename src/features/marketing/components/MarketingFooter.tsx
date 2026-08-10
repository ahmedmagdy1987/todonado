import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'

interface FooterLink {
  label: string
  to: string
}

const SECTIONS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Home', to: '/welcome' },
      { label: 'Pricing', to: '/pricing' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms of Use', to: '/terms' },
    ],
  },
  {
    heading: 'Company',
    links: [{ label: 'About Us', to: '/about' }],
  },
]

/** Public footer shared by the marketing and legal pages. */
export function MarketingFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-white/5 bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="flex flex-col gap-3">
            <Link
              to="/welcome"
              className="focus-ring inline-flex w-fit rounded-lg"
              aria-label="Todonado home"
            >
              <Logo />
            </Link>
            <p className="max-w-xs text-sm text-text-muted">
              Plan a realistic day, every day. Write everything down, commit to what fits, and
              stay focused.
            </p>
          </div>

          {/* Link columns */}
          {SECTIONS.map((section) => (
            <nav
              key={section.heading}
              aria-label={section.heading}
              className="flex flex-col gap-3"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted/70">
                {section.heading}
              </p>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="focus-ring inline-flex min-h-[32px] items-center rounded text-sm text-text-muted transition-colors hover:text-text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center gap-2 border-t border-white/5 pt-6 text-xs text-text-muted sm:flex-row sm:justify-between">
          <p>© {year} Todonado</p>
          {/* Studio credit — deliberately plain text; a link is wired later.
              Uses the full muted token: at /60 it fell to ~3.5:1 contrast,
              which is unreadable rather than subtle. */}
          <p className="text-text-muted">Powered by HBV Studio</p>
        </div>
      </div>
    </footer>
  )
}
