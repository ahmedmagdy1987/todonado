import { BarChart3, FolderKanban, Inbox, Sun, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Exact-match the route (used for the index "Today" route). */
  end?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Today', icon: Sun, end: true },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/focus', label: 'Focus', icon: Timer },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
]
