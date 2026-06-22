import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { NAV_ITEMS } from './nav'
import { MoreNavSheet } from './MoreNavSheet'
import { cn } from '@/lib/utils'

/**
 * Mobile primary navigation: a fixed bar capped at 5 slots. The four core daily
 * tabs (Today · Inbox · Projects · Focus) sit directly in the bar; everything
 * else (Insights and any enabled flag-gated tabs like Wellness / Templates) lives
 * under a "More" tab that opens an accessible bottom sheet. The "More" tab shows
 * the active highlight whenever the current route is one of its items. Tabs are
 * data-driven from NAV_ITEMS; the desktop sidebar (md:flex) shows everything.
 * Add-task lives in the floating FAB; account + Log out behind the top-bar avatar.
 */
export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()

  const primary = NAV_ITEMS.filter((i) => i.primary)
  const overflow = NAV_ITEMS.filter((i) => !i.primary)
  const moreActive = overflow.some((i) =>
    i.end ? pathname === i.to : pathname === i.to || pathname.startsWith(`${i.to}/`),
  )

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="flex h-16 items-stretch">
          {primary.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'focus-ring relative flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                  isActive ? 'text-brand' : 'text-text-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-x-0 top-0 mx-auto h-0.5 w-8 rounded-full transition-colors',
                      isActive ? 'bg-brand' : 'bg-transparent',
                    )}
                  />
                  <Icon className="h-5 w-5" aria-hidden />
                  <span className="max-w-full truncate">{label}</span>
                </>
              )}
            </NavLink>
          ))}

          {overflow.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-label="More destinations"
              className={cn(
                'focus-ring relative flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                moreActive ? 'text-brand' : 'text-text-muted',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'absolute inset-x-0 top-0 mx-auto h-0.5 w-8 rounded-full transition-colors',
                  moreActive ? 'bg-brand' : 'bg-transparent',
                )}
              />
              <MoreHorizontal className="h-5 w-5" aria-hidden />
              <span className="max-w-full truncate">More</span>
            </button>
          )}
        </div>
      </nav>

      <MoreNavSheet open={moreOpen} onClose={() => setMoreOpen(false)} items={overflow} />
    </>
  )
}
