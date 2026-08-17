import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'

/**
 * THE PUBLIC HEADER, AS A COMMERCIAL LANDING HEADER RATHER THAN AN APP BAR.
 *
 * ── WHAT IT REPLACES ───────────────────────────────────────────────────────
 *
 * The previous header was a logo, one "Pricing" link that was `hidden` below
 * 640px, and two buttons. On a phone that left a brand mark and two buttons:
 * no way to find out what the product contained without scrolling the entire
 * page, and no signal that there was anything to find. A visitor who wanted to
 * know "what is this and what does it include" had no affordance at all.
 *
 * ── WHY THE NAV IS FOUR ITEMS ──────────────────────────────────────────────
 *
 * One per question a first-time visitor actually asks, in the order they ask
 * it: what is in it (Product), how do I use it (How it works), how is this
 * different from what I already have (Compare), what does it cost (Pricing).
 * Each is a real destination. There is no "Solutions", no "Resources", and no
 * dropdown, because there is nothing behind them yet and a menu that opens onto
 * one link is worse than a link.
 *
 * ── THE HASH LINKS ARE ROUTE-AWARE, WHICH IS NOT COSMETIC ──────────────────
 *
 * Three of the four are sections of the landing page. On /welcome they must
 * scroll; on /pricing or /about they must NAVIGATE and then scroll. React
 * Router does not scroll to a hash on its own, so `LandingPage` handles the
 * arriving hash and this component only has to emit the right kind of link.
 */

interface NavItem {
  label: string
  /** A section of the landing page, or an absolute route. */
  hash?: string
  to?: string
}

const NAV: NavItem[] = [
  { label: 'Product', hash: 'product' },
  { label: 'How it works', hash: 'how-it-works' },
  { label: 'Compare', hash: 'compare' },
  { label: 'Pricing', to: '/pricing' },
]

export function SiteHeader() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  const onLanding = location.pathname === '/welcome'

  function goAuth(mode: 'signin' | 'signup') {
    setOpen(false)
    // Forward any `from` (set by ProtectedRoute) so login can return the user.
    navigate('/login', { state: { ...((location.state as object | null) ?? {}), mode } })
  }

  /*
   * The header gains a surface once the page has moved.
   *
   * At the top it is transparent so the hero reads full-bleed. The moment
   * content is scrolling underneath it, small nav text over a moving aurora
   * stops being legible, so it takes on an opaque background and a hairline.
   * Passive listener: this runs on every scroll frame and must never be the
   * reason a scroll janks.
   */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /** Close the mobile panel on Escape, and return focus to what opened it. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // A route change must never leave the panel open over the new page.
  useEffect(() => setOpen(false), [location.pathname, location.hash])

  /**
   * Scroll to a landing section, or navigate to it from another page.
   *
   * `replace` is deliberate: the header is not a place you want to have to
   * press Back through four times to leave the site.
   */
  const goSection = useCallback(
    (hash: string) => {
      setOpen(false)
      if (!onLanding) {
        navigate(`/welcome#${hash}`)
        return
      }
      const el = document.getElementById(hash)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // Keep the URL honest without adding a history entry per nav click.
      window.history.replaceState(null, '', `#${hash}`)
    },
    [navigate, onLanding],
  )

  const navLinkClass =
    'focus-ring inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary'

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-colors duration-300',
        scrolled
          ? 'border-b border-white/10 bg-background/92 backdrop-blur-md'
          : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link to="/welcome" className="focus-ring shrink-0 rounded-lg" aria-label="Todonado home">
          <Logo />
        </Link>

        {/* ── Desktop nav. Centred, so the brand and the CTAs anchor the ends. ── */}
        <nav aria-label="Main" className="ml-2 hidden flex-1 items-center justify-center lg:flex">
          {NAV.map((item) =>
            item.hash ? (
              <button
                key={item.label}
                type="button"
                onClick={() => goSection(item.hash as string)}
                className={navLinkClass}
              >
                {item.label}
              </button>
            ) : (
              <Link key={item.label} to={item.to as string} className={navLinkClass}>
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2 lg:ml-0">
          {session ? (
            <Button size="sm" className="whitespace-nowrap" onClick={() => navigate('/')}>
              Open app
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="hidden whitespace-nowrap sm:inline-flex"
                onClick={() => goAuth('signin')}
              >
                Sign in
              </Button>
              <Button size="sm" className="whitespace-nowrap" onClick={() => goAuth('signup')}>
                Start free
              </Button>
            </>
          )}

          {/* 44px square, which the icon alone would not be. */}
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:text-text-primary lg:hidden"
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {/*
        THE MOBILE PANEL IS A SHEET UNDER THE BAR, NOT A FULL-SCREEN TAKEOVER.
        There are five destinations. A full-screen overlay for five links makes
        leaving the menu feel like leaving the site, and it is the pattern that
        most often traps focus badly. This keeps the header visible, so the way
        out is the button you came in by.
      */}
      {open && (
        <div
          id="site-menu"
          ref={panelRef}
          className="border-t border-white/10 bg-background/98 backdrop-blur-md lg:hidden"
        >
          <nav aria-label="Main" className="mx-auto max-w-6xl px-4 py-2 sm:px-6">
            <ul className="divide-y divide-white/5">
              {NAV.map((item) => (
                <li key={item.label}>
                  {item.hash ? (
                    <button
                      type="button"
                      onClick={() => goSection(item.hash as string)}
                      className="focus-ring flex min-h-[52px] w-full items-center rounded-lg px-1 text-left text-base font-medium text-text-primary"
                    >
                      {item.label}
                    </button>
                  ) : (
                    <Link
                      to={item.to as string}
                      className="focus-ring flex min-h-[52px] w-full items-center rounded-lg px-1 text-base font-medium text-text-primary"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
              {!session && (
                <li className="pt-3 pb-2">
                  <Button variant="outline" className="w-full" onClick={() => goAuth('signin')}>
                    Sign in
                  </Button>
                </li>
              )}
            </ul>
          </nav>
        </div>
      )}
    </header>
  )
}
