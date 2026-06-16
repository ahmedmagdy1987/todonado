import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ChevronRight, Crown, LogOut, Plus, Settings, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { Badge, Button, Modal } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { usePlan } from '@/features/billing/usePlan'
import { NAV_ITEMS } from './nav'

function usePageTitle(): string {
  const { pathname } = useLocation()
  if (pathname.startsWith('/settings')) return 'Settings'
  const match = NAV_ITEMS.find((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to),
  )
  return match?.label ?? 'Todonado'
}

function SheetLink({
  icon: Icon,
  label,
  onClick,
  right,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  right?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-text-primary transition-colors hover:bg-surface-2/60"
    >
      <Icon className="h-[18px] w-[18px] shrink-0 text-text-muted" aria-hidden />
      <span className="flex-1">{label}</span>
      {right ?? <ChevronRight className="h-4 w-4 text-text-muted/60" aria-hidden />}
    </button>
  )
}

export function TopBar({ onAddTask }: { onAddTask?: () => void }) {
  const title = usePageTitle()
  const today = format(new Date(), 'EEEE, MMM d')
  const { user, signOut } = useAuth()
  const { profile } = useWorkspace()
  const { plan, isFounding } = usePlan()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)

  const name = profile?.full_name || profile?.display_name || user?.email || 'Account'
  const initial = (name || '?').charAt(0).toUpperCase()
  const planLabel = isFounding ? 'Founding' : plan === 'pro' ? 'Pro' : 'Free'

  const go = (to: string) => {
    setProfileOpen(false)
    navigate(to)
  }

  return (
    <header className="flex h-[4.5rem] shrink-0 items-center gap-2 border-b border-white/5 bg-background/80 px-4 backdrop-blur sm:gap-3 md:px-8">
      <div className="shrink-0 md:hidden">
        <Logo showWordmark={false} />
      </div>

      <div className="flex min-w-0 shrink items-baseline gap-2">
        <h1 className="shrink-0 font-display text-lg font-semibold">{title}</h1>
        <span className="hidden truncate text-sm text-text-muted sm:inline">· {today}</span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          aria-label="Account"
          aria-haspopup="dialog"
          className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white md:hidden"
        >
          {initial}
        </button>
        <Button
          size="sm"
          onClick={onAddTask}
          disabled={!onAddTask}
          title="New task"
          className="hidden md:inline-flex"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add task
        </Button>
      </div>

      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} title="Account">
        <div className="space-y-2 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-surface-2/40 px-3 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary">{name}</p>
              {profile?.username ? (
                <p className="truncate text-xs text-text-muted">@{profile.username}</p>
              ) : (
                <p className="truncate text-xs text-text-muted">{user?.email ?? 'Signed in'}</p>
              )}
            </div>
          </div>

          <SheetLink icon={User} label="My Account" onClick={() => go('/settings')} />
          <SheetLink icon={Settings} label="Settings" onClick={() => go('/settings')} />
          <SheetLink
            icon={Crown}
            label="My Plan"
            onClick={() => go('/settings/plan')}
            right={<Badge variant={plan === 'pro' ? 'brand' : 'outline'}>{planLabel}</Badge>}
          />

          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                setProfileOpen(false)
                void signOut()
              }}
              className="focus-ring flex w-full items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-left text-sm font-medium text-text-muted transition-colors hover:bg-surface-2/60 hover:text-danger"
            >
              <LogOut className="h-[18px] w-[18px]" aria-hidden />
              Log out
            </button>
          </div>
        </div>
      </Modal>
    </header>
  )
}
