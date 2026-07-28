import { computeCapacity, type CapacitySummary } from '@/features/today/capacity'

/**
 * Shared pure math + data behind the landing page's live demo widgets. No
 * React, no I/O, no DB, no analytics — fully unit-tested.
 *
 * The widgets are marketing demos, but they are NOT fakes: the capacity math
 * here is the product's real `computeCapacity`, and the auto-plan widget runs
 * the product's real `planDay`. A visitor sees exactly the behaviour they'd get
 * after signing up. Everything is in-memory and disposable.
 *
 * Per-widget fixtures live in their own modules (`autoPlanFixture`,
 * `focusTiming`) so the eagerly-bundled hero doesn't drag them into the
 * landing's first-paint chunk.
 */

/** Demo capacity: 6h — the same default a real new account starts with. */
export const DEMO_CAPACITY_MINUTES = 360

/** One-tap effort presets offered by the meter demo (the app's chips, minus 2h). */
export const DEMO_EFFORT_CHIPS = [15, 30, 60, 90] as const

/** A weightless task used by the meter demos — title + minutes, nothing else. */
export interface DemoTask {
  id: string
  title: string
  effort: number
}

/**
 * Plausible, boring work items for the meter demo. Deliberately generic: no
 * invented customers, metrics, or testimonials.
 */
const METER_TITLES = [
  'Review the design draft',
  'Reply to customer emails',
  'Write the weekly update',
  'Fix the reported bug',
  'Prep tomorrow’s meeting',
  'Refactor the export helper',
  'Call the supplier back',
  'Update the changelog',
] as const

/** Build the next demo task for a list, cycling the title pool. */
export function nextDemoTask(list: DemoTask[], minutes: number, seq = list.length): DemoTask {
  return {
    id: `demo-${seq + 1}`,
    title: METER_TITLES[seq % METER_TITLES.length],
    effort: minutes,
  }
}

/** Total committed minutes across demo tasks. */
export function sumDemoEffort(list: DemoTask[]): number {
  return list.reduce((total, t) => total + t.effort, 0)
}

/** Run the REAL capacity math over a demo list. */
export function demoSummary(
  list: DemoTask[],
  capacityMinutes: number = DEMO_CAPACITY_MINUTES,
): CapacitySummary {
  return computeCapacity(sumDemoEffort(list), capacityMinutes)
}

/**
 * The demo's stand-in for the product's overbooking guard: drop the single
 * biggest task so the day fits again. (The real app suggests the
 * lowest-PRIORITY work — demo tasks carry no priority, so size is the honest
 * analogue.) Ties resolve to the last one added; an empty list is returned
 * unchanged.
 */
export function dropLargest(list: DemoTask[]): DemoTask[] {
  if (list.length === 0) return list
  let victim = 0
  for (let i = 1; i < list.length; i += 1) {
    if (list[i].effort >= list[victim].effort) victim = i
  }
  return list.filter((_, i) => i !== victim)
}

// ---------------------------------------------------------------------------
//  Hero: a scripted, self-playing fill that ends in the amber "nearly full" zone
// ---------------------------------------------------------------------------

/**
 * The hero's five tasks drop in one at a time. Cumulative: 90 → 150 → 195 →
 * 255 → 330 of 360 minutes, i.e. the meter finishes at 92% — amber, "nearly
 * full" — which is the exact moment the product is about.
 */
export const HERO_STEPS: readonly DemoTask[] = [
  { id: 'hero-1', title: 'Deep work: pricing spec', effort: 90 },
  { id: 'hero-2', title: 'Team sync', effort: 60 },
  { id: 'hero-3', title: 'Review two pull requests', effort: 45 },
  { id: 'hero-4', title: 'Draft the launch email', effort: 60 },
  { id: 'hero-5', title: 'Customer calls', effort: 75 },
] as const

/** The hero list after `n` steps have dropped in (n is clamped to the script). */
export function heroTasksAt(step: number): DemoTask[] {
  return HERO_STEPS.slice(0, Math.max(0, Math.min(HERO_STEPS.length, step)))
}
