import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'

/**
 * THE PUBLIC HEADER.
 *
 * ── WHAT IT REPLACES ───────────────────────────────────────────────────────
 *
 * A single row with a logo, one "Pricing" link that was HIDDEN below `sm`, and
 * two buttons. On a phone the entire navigation of the site was two auth
 * buttons, which is why the page never felt like a commercial website: there
 * was nothing to navigate.
 *
 * ── THE NAV IS SECTION-AWARE, NOT DECORATIVE ───────────────────────────────
 *
 * Four items, each pointing at a real section of the landing page, chosen
 * because each answers a question a buyer actually asks: what does it do
 * (Features), how does it work (How it works), how does it compare (Compare),
 * what does it cost (Pricing). Nothing is here to fill space, and there is no
 * "Product" item because it would point at the top of a page the visitor is
 * already on.
 *
 * The links resolve differently depending on where you are, which is what keeps
 * them honest: ON the landing they are in-page anchors; anywhere else they are
 * router links to `/welcome#id`, and the landing scrolls to the hash on
 * arrival. A plain `<a href="/welcome#id">` would have worked too, at the cost
 * of a full document reload on every nav click.
 *
 * ── IT IS QUIET AT THE TOP AND SOLID AFTER THAT ────────────────────────────
 *
 * At rest the header is transparent, so the hero begins at the very top of the
 * screen. Past the first scroll it takes a real opaque-ish surface and a
 * hairline, because a translucent bar over a dense feature table is unreadable.
 * No floating pill: a detached capsule is a fashion, and it costs the header
 * its full-bleed edge, which is the thing that makes a site feel built.
 */

interface NavItem {
  id: string
  label: string
}

/** The four sections a buyer navigates between. Each MUST exist on the landing. */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'compare', label: 'Compare' },
  { id: 'pricing', label: 'Pricing' },
] as const

const LANDING_PATH = '/welcome'

export function MarketingHeader() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const onLanding = location.pathname === LANDING_PATH || location.pathname === '/'

  /*
   * One passive listener coalesced into one rAF, writing one boolean. The same
   * discipline the aurora uses: a re-render per scroll frame is exactly the
   * main-thread cost a marketing page cannot afford.
   */
  useEffect(() => {
    let frame = 0
    const apply = () => {
      frame = 0
      const next = window.scrollY > 8
      // Only ever writes on a transition. A `setState` per scroll frame is
      // cheap in React and still not free, and this runs on a marketing page
      // whose whole performance budget is first paint.
      setScrolled((current) => (current === next ? current : next))
    }
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(apply)
    }
    apply()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    // Focus goes back to the control that opened the sheet, never to the top of
    // the document: losing your place is the most common keyboard bug in a
    // drawer, and it is entirely avoidable.
    toggleRef.current?.focus()
  }, [])

  // Escape closes, and the page behind does not scroll while it is open.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
      }
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Move focus into the sheet so the next Tab lands inside it.
    sheetRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [menuOpen, closeMenu])

  function goAuth(mode: 'signin' | 'signup') {
    setMenuOpen(false)
    navigate('/login', { state: { ...((location.state as object | null) ?? {}), mode } })
  }

  const navLinkClass =
    'focus-ring inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary'

  function renderNavLink(item: NavItem, className: string) {
    return onLanding ? (
      <a key={item.id} href={`#${item.id}`} className={className} onClick={() => setMenuOpen(false)}>
        {item.label}
      </a>
    ) : (
      <Link
        key={item.id}
        to={`${LANDING_PATH}#${item.id}`}
        className={className}
        onClick={() => setMenuOpen(false)}
      >
        {item.label}
      </Link>
    )
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-colors duration-300',
        /*
         * OPAQUE ON SCROLL, NOT BLURRED.
         *
         * A permanent `backdrop-filter` re-rasterises the blurred strip on
         * every scroll frame, which is the same class of bug this repo already
         * paid for once on this page: the aurora dropped scrolling from 60fps
         * to 21 because a blurred surface re-rasterises whenever it moves. Blur
         * is kept for the mobile sheet, where it is a modal surface that does
         * not move. Over a dense feature table a translucent bar is unreadable
         * anyway, so opaque is also simply the better result.
         */
        scrolled
          ? 'border-b border-white/[0.08] bg-background'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to={LANDING_PATH} className="focus-ring inline-flex min-h-[44px] shrink-0 items-center rounded-lg" aria-label="Todonado home">
          <Logo />
        </Link>

        {/* Centre: the site's actual navigation. Desktop only; the sheet below
            carries the identical list on a phone. */}
        <nav aria-label="Sections" className="hidden flex-1 justify-center md:flex">
          {NAV_ITEMS.map((item) => renderNavLink(item, navLinkClass))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {session ? (
            <Button size="sm" className="whitespace-nowrap shadow-none" onClick={() => navigate('/today')}>
              Open app
            </Button>
          ) : (
            <>
              {/* Hidden on the smallest screens so the row never wraps; it is
                  the first item in the sheet instead. */}
              <Button
                variant="ghost"
                size="sm"
                className="hidden whitespace-nowrap sm:inline-flex"
                onClick={() => goAuth('signin')}
              >
                Log in
              </Button>
              <Button size="sm" className="whitespace-nowrap shadow-none" onClick={() => goAuth('signup')}>
                Start free
              </Button>
            </>
          )}

          <button
            ref={toggleRef}
            type="button"
            onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
            aria-expanded={menuOpen}
            aria-controls="marketing-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:text-text-primary md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {/* The mobile sheet. Rendered inside the header so the sticky context and
          the focus order both stay in one place. */}
      {menuOpen && (
        <div className="md:hidden">
          {/*
            The scrim is decorative, not a control.
            It used to be a <button aria-label="Close menu">, which gave a
            screen-reader user TWO buttons with that exact name: this one and
            the toggle in the bar. Tapping outside is a pointer convenience;
            the accessible ways to close are the toggle and Escape, and both
            work. So this is `aria-hidden` and out of the accessibility tree.
          */}
          <div
            aria-hidden
            onClick={closeMenu}
            className="fixed inset-0 top-16 z-30 bg-background/70 backdrop-blur-sm"
          />
          <div
            id="marketing-menu"
            ref={sheetRef}
            className="absolute inset-x-0 top-16 z-40 border-b border-white/10 bg-surface-2 px-4 pb-6 pt-2 shadow-elevation-lg"
          >
            <nav aria-label="Sections" className="flex flex-col">
              {NAV_ITEMS.map((item) =>
                renderNavLink(
                  item,
                  'focus-ring flex min-h-[52px] items-center rounded-lg px-2 text-base font-medium text-text-primary border-b border-white/5 last:border-b-0',
                ),
              )}
            </nav>
            {!session && (
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => goAuth('signin')}
              >
                Log in
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
