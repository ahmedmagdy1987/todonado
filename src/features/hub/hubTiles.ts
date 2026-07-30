import {
  BarChart3,
  ClipboardCheck,
  Compass,
  Flag,
  HeartPulse,
  LayoutTemplate,
  Network,
  NotebookPen,
  Play,
  Settings as SettingsIcon,
  Sprout,
  Sun,
  Timer,
  Wand2,
  Wind,
  CalendarRange,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FEATURES } from '@/lib/config'
import type { FeatureKey } from '@/types/database'

/**
 * The Hub's tile registry — pure data, so what the grid contains is testable
 * without rendering anything.
 *
 * IT IS ADDITIVE, NOT A REPLACEMENT. Today is still the default screen after
 * login and every one of these destinations is still reachable the way it always
 * was. The Hub is a second door, for the days when you know you want to *do*
 * something but not which part of the app does it.
 *
 * EVERY TILE IS GATED BY THE SAME FLAG AS ITS ROUTE. A tile whose route is not
 * mounted would land on the catch-all redirect and silently drop the user on
 * Today, which reads as a bug — so the gating is duplicated here deliberately
 * and `hubTiles.test.ts` asserts the two lists agree.
 */

export interface HubTile {
  id: string
  /** Short by design — the icon carries the rest. */
  label: string
  /** One line, lower-case, no full stop. */
  hint: string
  icon: LucideIcon
  /** Where it goes. Absent means it is not built — see `intentKey`. */
  to?: string
  /**
   * A tile that is deliberately NOT built. Tapping it reveals an honest
   * explanation and an interest chip; it never navigates and never pretends.
   */
  intentKey?: FeatureKey
  /** Why it isn't built. Required when `intentKey` is set. */
  soonReason?: string
}

export function hubTiles(): HubTile[] {
  return [
    ...(FEATURES.getToWork
      ? [{ id: 'work', label: 'Get to work', hint: 'pick one thing and start', icon: Play, to: '/work' }]
      : []),
    ...(FEATURES.autoPlan
      ? [
          {
            id: 'plan',
            label: 'Build my day',
            hint: 'fill today, never over',
            icon: Wand2,
            // Lands on Today with the planner's preview already open. `/today`,
            // not `/` — `/` means "wherever this device starts" and drops the
            // query, so a hub-start user would never see the planner.
            to: '/today?plan=1',
          },
        ]
      : []),
    { id: 'today', label: 'Today', hint: 'your command center', icon: Sun, to: '/today' },
    ...(FEATURES.week
      ? [{ id: 'week', label: 'Week', hint: 'the next seven days', icon: CalendarRange, to: '/week' }]
      : []),
    ...(FEATURES.templates
      ? [
          {
            id: 'templates',
            label: 'Templates',
            hint: 'start from a ready-made list',
            icon: LayoutTemplate,
            to: '/templates',
          },
          {
            id: 'checklists',
            label: 'Checklists',
            hint: 'repeated-use lists, no dates',
            icon: ClipboardCheck,
            to: '/templates?category=checklists',
          },
        ]
      : []),
    {
      id: 'focus',
      label: FEATURES.pomodoro ? 'Focus & pomodoro' : 'Focus timer',
      hint: 'one task, one timer',
      icon: Timer,
      to: '/focus',
    },
    ...(FEATURES.wellness
      ? [
          {
            id: 'breathe',
            label: 'Breathwork',
            hint: 'a minute to settle',
            icon: Wind,
            to: '/wellness/breathe',
          },
        ]
      : []),
    ...(FEATURES.wellness && FEATURES.quitTracker
      ? [
          {
            id: 'quit',
            label: 'Quit tracker',
            hint: 'count the days since you stopped',
            icon: Sprout,
            to: '/wellness/quit',
          },
        ]
      : []),
    ...(FEATURES.vision
      ? [{ id: 'vision', label: 'Vision', hint: 'what all of this is for', icon: Compass, to: '/vision' }]
      : []),
    ...(FEATURES.vision && FEATURES.mindMaps
      ? [
          {
            id: 'mindmaps',
            label: 'Mind maps',
            hint: 'think it out first',
            icon: Network,
            to: '/vision/maps',
          },
        ]
      : []),
    // WAS A FAKE DOOR. It said a journal needed an AI service, which was true of
    // the version that reads you back and false of the one that simply lets you
    // write. The writing half now ships (text always, voice on Pro) and the AI
    // half is stated as unbuilt ON the journal page itself, where someone can
    // actually see what does and does not exist.
    ...(FEATURES.journal
      ? [{ id: 'journal', label: 'Journal', hint: 'how today went', icon: NotebookPen, to: '/journal' }]
      : []),
    ...(FEATURES.challenges
      ? [{ id: 'challenges', label: 'Challenges', hint: 'a short, structured push', icon: Flag, to: '/challenges' }]
      : []),
    { id: 'insights', label: 'Insights', hint: 'where the time actually went', icon: BarChart3, to: '/insights' },
    ...(FEATURES.wellness
      ? [{ id: 'wellness', label: 'Wellness', hint: 'the calmer side', icon: HeartPulse, to: '/wellness' }]
      : []),
    { id: 'settings', label: 'Settings', hint: 'plan, account, sounds', icon: SettingsIcon, to: '/settings' },
  ]
}
