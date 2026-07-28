import {
  BarChart3,
  CalendarRange,
  FolderKanban,
  HeartPulse,
  Inbox,
  LayoutTemplate,
  Sun,
  Timer,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FEATURES } from '@/lib/config'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Exact-match the route (used for the index "Today" route). */
  end?: boolean
  /**
   * Core daily tab — shown directly in the mobile bottom bar. Non-primary items
   * (Insights and any flag-gated tabs) live under the bottom bar's "More" sheet,
   * so the bar never exceeds 5 slots. The desktop sidebar shows everything.
   */
  primary?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Today', icon: Sun, end: true, primary: true },
  // Week planning — only present when the feature flag is on. Not `primary`, so
  // it lives in the mobile More sheet and the bottom bar keeps its 5 slots.
  ...(FEATURES.week ? [{ to: '/week', label: 'Week', icon: CalendarRange }] : []),
  { to: '/inbox', label: 'Inbox', icon: Inbox, primary: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban, primary: true },
  { to: '/focus', label: 'Focus', icon: Timer, primary: true },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
  // Wellness suite — only present when the feature flag is on.
  ...(FEATURES.wellness ? [{ to: '/wellness', label: 'Wellness', icon: HeartPulse }] : []),
  // Templates library — only present when the feature flag is on.
  ...(FEATURES.templates ? [{ to: '/templates', label: 'Templates', icon: LayoutTemplate }] : []),
]
