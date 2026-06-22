import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './nav'
import { cn } from '@/lib/utils'

/**
 * Mobile primary navigation: a fixed, evenly-spaced tab bar covering every
 * destination (Today · Inbox · Projects · Focus · Insights, plus Wellness and
 * Templates when their feature flags are on). Tabs are data-driven from NAV_ITEMS
 * and flex-1, so the bar reflows as items change (labels truncate on narrow
 * phones when many optional flags are enabled). The desktop sidebar (md:flex) is
 * unchanged. Add-task lives in the floating FAB; account + Log out live behind
 * the top-bar avatar.
 */
export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="flex h-16 items-stretch">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
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
      </div>
    </nav>
  )
}
