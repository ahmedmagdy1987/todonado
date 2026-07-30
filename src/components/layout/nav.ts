import {
  BarChart3,
  CalendarRange,
  Compass,
  FolderKanban,
  HeartPulse,
  Inbox,
  LayoutGrid,
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
  // The Hub sits at the TOP of the desktop sidebar (this array is the sidebar's
  // order) but is deliberately NOT `primary`: the mobile bottom bar's four
  // primary slots + More already fill its five, and a sixth would break the rule
  // documented on NavItem.primary. On mobile it lives in the More sheet.
  ...(FEATURES.hub ? [{ to: '/hub', label: 'Hub', icon: LayoutGrid }] : []),
  { to: '/today', label: 'Today', icon: Sun, end: true, primary: true },
  // Week planning — only present when the feature flag is on. Not `primary`, so
  // it lives in the mobile More sheet and the bottom bar keeps its 5 slots.
  ...(FEATURES.week ? [{ to: '/week', label: 'Week', icon: CalendarRange }] : []),
  { to: '/inbox', label: 'Inbox', icon: Inbox, primary: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban, primary: true },
  { to: '/focus', label: 'Focus', icon: Timer, primary: true },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
  // Vision — only present when the feature flag is on. Not `primary`, so the
  // mobile bottom bar keeps its 5 slots.
  ...(FEATURES.vision ? [{ to: '/vision', label: 'Vision', icon: Compass }] : []),
  // Wellness suite — only present when the feature flag is on.
  ...(FEATURES.wellness ? [{ to: '/wellness', label: 'Wellness', icon: HeartPulse }] : []),
  // Templates library — only present when the feature flag is on.
  ...(FEATURES.templates ? [{ to: '/templates', label: 'Templates', icon: LayoutTemplate }] : []),
]
