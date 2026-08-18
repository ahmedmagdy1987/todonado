import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { LEGAL_CONTACT } from '@/lib/config'

interface FooterLink {
  label: string
  to: string
  /** An external/mail destination renders as a plain anchor, not a router link. */
  external?: boolean
}

/*
 * ONLY REAL DESTINATIONS.
 *
 * Every entry resolves to a route that exists or an address that is answered.
 * There are no social accounts here because there are none to link to, and a
 * footer full of dead icons is the fastest way to make a product look
 * abandoned. The support address is the one the legal pages already publish.
 *
 * The section links point at the landing page's own anchors, so the footer
 * doubles as the site map the header nav describes.
 */
const SECTIONS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Home', to: '/welcome' },
      { label: 'Features', to: '/welcome#features' },
      { label: 'Pricing', to: '/pricing' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Log in', to: '/login' },
      { label: 'Start free', to: '/login' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Support', to: `mailto:${LEGAL_CONTACT}`, external: true },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms of Use', to: '/terms' },
    ],
  },
]

/** 44px targets: a footer link is a real tap target on a phone, not an aside. */
const LINK_CLASS =
  'focus-ring inline-flex min-h-[44px] items-center rounded text-sm text-text-muted transition-colors hover:text-text-primary'

/** Public footer shared by the marketing and legal pages. */
export function MarketingFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-white/5 bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="flex flex-col gap-3">
            <Link
              to="/welcome"
              className="focus-ring inline-flex min-h-[44px] w-fit items-center rounded-lg"
              aria-label="Todonado home"
            >
              <Logo />
            </Link>
            <p className="max-w-xs text-sm text-text-muted">
              Plan a realistic day, every day. Write everything down, commit to what fits, and
              stay focused.
            </p>
          </div>

          {/*
            Two columns from the smallest width. Four stacked nav groups is a
            600px tower of links at the very bottom of a phone page, which is
            where a reader has the least patience for one.
          */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-7 sm:col-span-1 sm:grid-cols-1 lg:col-span-4 lg:grid-cols-4">
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
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.to}
                        className={LINK_CLASS}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link to={link.to} className={LINK_CLASS}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-2 border-t border-white/5 pt-5 text-xs text-text-muted sm:flex-row sm:justify-between">
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
