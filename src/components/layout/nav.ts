import {
  BarChart3,
  CalendarRange,
  Compass,
  Flag,
  FolderKanban,
  HeartPulse,
  Inbox,
  LayoutGrid,
  NotebookPen,
  LayoutTemplate,
  Sun,
  Timer,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FEATURES } from '@/lib/config'

/**
 * Sidebar sections.
 *
 * The sidebar reached twelve destinations, at which point a flat list stops
 * being scannable — you read it rather than glance at it. Four short groups of
 * two-to-four items each restore that, and the names describe WHEN you reach for
 * something rather than what it technically is.
 *
 * Order matters: this is the sidebar's rendering order.
 */
export const NAV_GROUPS = ['plan', 'do', 'reflect', 'explore'] as const
export type NavGroup = (typeof NAV_GROUPS)[number]

export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
  plan: 'Plan',
  do: 'Do',
  reflect: 'Reflect',
  explore: 'Explore',
}

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /**
   * Which sidebar section it belongs to. The Hub is deliberately UNGROUPED — it
   * is the view OF the groups, so filing it under one of them would be wrong.
   */
  group?: NavGroup
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
  { to: '/today', label: 'Today', icon: Sun, end: true, primary: true, group: 'plan' as const },
  // Week planning — only present when the feature flag is on. Not `primary`, so
  // it lives in the mobile More sheet and the bottom bar keeps its 5 slots.
  ...(FEATURES.week ? [{ to: '/week', label: 'Week', icon: CalendarRange, group: 'plan' as const }] : []),
  { to: '/inbox', label: 'Inbox', icon: Inbox, primary: true, group: 'plan' as const },
  { to: '/projects', label: 'Projects', icon: FolderKanban, primary: true, group: 'plan' as const },
  { to: '/focus', label: 'Focus', icon: Timer, primary: true, group: 'do' as const },
  { to: '/insights', label: 'Insights', icon: BarChart3, group: 'reflect' as const },
  // Vision — only present when the feature flag is on. Not `primary`, so the
  // mobile bottom bar keeps its 5 slots.
  ...(FEATURES.vision ? [{ to: '/vision', label: 'Vision', icon: Compass, group: 'reflect' as const }] : []),
  // Journal — only present when the feature flag is on. Not `primary`: it is an
  // end-of-day surface rather than a daily tab, so it lives in the mobile More
  // sheet and the bottom bar keeps its 5 slots.
  ...(FEATURES.journal ? [{ to: '/journal', label: 'Journal', icon: NotebookPen, group: 'reflect' as const }] : []),
  // Challenges — only present when the feature flag is on. Not `primary`: it is
  // something you visit occasionally, not a daily tab, so it lives in the mobile
  // More sheet and the bottom bar keeps its 5 slots.
  ...(FEATURES.challenges ? [{ to: '/challenges', label: 'Challenges', icon: Flag, group: 'do' as const }] : []),
  // Wellness suite — only present when the feature flag is on.
  ...(FEATURES.wellness ? [{ to: '/wellness', label: 'Wellness', icon: HeartPulse, group: 'explore' as const }] : []),
  // Templates library — only present when the feature flag is on.
  ...(FEATURES.templates ? [{ to: '/templates', label: 'Templates', icon: LayoutTemplate, group: 'explore' as const }] : []),
]
