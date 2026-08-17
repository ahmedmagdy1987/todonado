import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { LEGAL_CONTACT } from '@/lib/config'

interface FooterLink {
  label: string
  to: string
  /** Rendered as a plain anchor: a `mailto:` is not a route. */
  external?: boolean
}

/**
 * THREE COLUMNS THAT MATCH THE PAGE ABOVE THEM.
 *
 * The footer used to offer four links in total: Home, Pricing, Privacy, Terms,
 * About. A visitor who reached the bottom because they were looking for
 * something specific found almost nothing to look at, which reads as a site
 * that has almost nothing in it.
 *
 * Product now points at the real sections of the landing page, so the footer is
 * a second route to the same information rather than a legal formality. Every
 * entry is a destination that exists: there are no placeholder social links,
 * no "Careers", and no "Blog", because inventing a link that goes nowhere is
 * the fastest way to make a small product look abandoned rather than small.
 *
 * Support is `LEGAL_CONTACT` from `@/lib/config`, which is the address the
 * privacy and terms pages already publish. Imported rather than typed out, so
 * the footer cannot come to advertise a different inbox from the legal pages.
 * It is the only support channel that exists, so it is the only one named.
 */
const SECTIONS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: 'Product',
    links: [
      { label: 'What is inside', to: '/welcome#product' },
      { label: 'How it works', to: '/welcome#how-it-works' },
      { label: 'Compare', to: '/welcome#compare' },
      { label: 'Free vs Pro', to: '/welcome#plans' },
      { label: 'Pricing', to: '/pricing' },
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
                {section.links.map((link) => {
                  // 44px, not the 32px this used to be. The footer was never
                  // covered by the app's ergonomics sweep, because that suite
                  // signs in first and never reaches a public page.
                  const className =
                    'focus-ring inline-flex min-h-[44px] items-center rounded text-sm text-text-muted transition-colors hover:text-text-primary'
                  return (
                    <li key={link.to}>
                      {link.external ? (
                        <a href={link.to} className={className}>
                          {link.label}
                        </a>
                      ) : (
                        <Link to={link.to} className={className}>
                          {link.label}
                        </Link>
                      )}
                    </li>
                  )
                })}
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
