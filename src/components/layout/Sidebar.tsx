import { Link, NavLink } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { useAuth } from '@/features/auth/auth-context'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { NAV_GROUPS, NAV_GROUP_LABEL, NAV_ITEMS, type NavItem } from './nav'
import { cn } from '@/lib/utils'

/** One nav row. Extracted so the grouped and ungrouped lists cannot drift. */
function SidebarLink({ item }: { item: NavItem }) {
  const { to, label, icon: Icon, end } = item
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-brand-gradient-soft text-text-primary'
            : 'text-text-muted hover:bg-surface-2/60 hover:text-text-primary',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              'h-[18px] w-[18px] shrink-0 transition-colors',
              isActive ? 'text-brand' : 'text-text-muted group-hover:text-text-primary',
            )}
            aria-hidden
          />
          {label}
        </>
      )}
    </NavLink>
  )
}

export function Sidebar() {
  const { user, signOut } = useAuth()
  const { profile } = useWorkspace()
  const name = profile?.full_name || profile?.display_name || user?.email || 'Account'
  const initial = (name || '?').charAt(0).toUpperCase()
  // Anything without a group renders loose at the top — today that is the Hub.
  const ungrouped = NAV_ITEMS.filter((i) => !i.group)

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/5 bg-surface/50 md:flex">
      <div className="flex h-[4.5rem] items-center px-5">
        <Logo />
      </div>

      {/*
        GROUPED, because twelve flat destinations stop being scannable — you read
        the list instead of glancing at it. Nothing is removed or moved out of
        reach; the same items are simply banded under four short headings, and
        the Hub stays loose at the top because it is the view OF the groups.

        The headings are `aria-hidden` and the real structure is carried by
        nested `<ul>`s with `aria-label`, so a screen reader gets the grouping as
        landmarks rather than as stray text.
      */}
      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Sections">
        <ul className="space-y-1">
          {ungrouped.map((item) => (
            <li key={item.to}>
              <SidebarLink item={item} />
            </li>
          ))}
        </ul>

        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((i) => i.group === group)
          if (items.length === 0) return null
          return (
            <div key={group} className="mt-5 first:mt-2">
              <p
                aria-hidden
                className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted/50"
              >
                {NAV_GROUP_LABEL[group]}
              </p>
              <ul className="space-y-1" aria-label={NAV_GROUP_LABEL[group]}>
                {items.map((item) => (
                  <li key={item.to}>
                    <SidebarLink item={item} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-white/5 p-3">
        <div className="flex items-center gap-1">
          <Link
            to="/settings"
            title="Account & settings"
            className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2/60"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white">
              {initial}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium text-text-primary">{name}</p>
              <p className="truncate text-xs text-text-muted">
                {profile?.username ? `@${profile.username}` : 'View settings'}
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            title="Sign out"
            aria-label="Sign out"
            className="focus-ring shrink-0 rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-2/60 hover:text-danger"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  )
}
