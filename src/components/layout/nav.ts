import { BarChart3, FolderKanban, HeartPulse, Inbox, LayoutTemplate, Sun, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FEATURES } from '@/lib/config'

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
  // Wellness suite — only present when the feature flag is on.
  ...(FEATURES.wellness ? [{ to: '/wellness', label: 'Wellness', icon: HeartPulse }] : []),
  // Templates library — only present when the feature flag is on.
  ...(FEATURES.templates ? [{ to: '/templates', label: 'Templates', icon: LayoutTemplate }] : []),
]
