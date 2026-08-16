import { computeCapacity, type CapacitySummary } from '@/features/today/capacity'
import { DEMO_CAPACITY_MINUTES, type DemoTask } from './landingDemo'

/**
 * The arithmetic the problem section performs, in one place.
 *
 * ── WHY THIS IS A MODULE AND NOT JSX ───────────────────────────────────────
 *
 * The section's whole argument is a SUM, and the copy states the result of that
 * sum in words ("8h 20m of work into a 6 hour day"). Written inline, the words
 * and the numbers would be two independent things that happen to agree today,
 * and the first edit to the list would silently make the sentence false — the
 * exact failure mode `pricing.ts` exists to prevent for prices.
 *
 * So the list lives here, the total is DERIVED from it by the product's real
 * `computeCapacity`, and `problemFixture.test.ts` asserts that the derived
 * numbers are the ones the copy claims. Change a task's minutes and the test
 * fails until the copy is changed to match.
 *
 * Nothing here is invented as flattery: these are ordinary items a teacher, an
 * accountant, a manager or a freelancer would recognise, in the same register
 * as `landingDemo.ts`'s pool. No fictional company, no fictional metric.
 */

/**
 * One ordinary day's worth of intentions.
 *
 * Deliberately NOT an absurd list. The point lands harder when every single
 * line is reasonable and the TOTAL is still impossible, because that is what
 * actually happens to people. A parody list would let a visitor off the hook.
 */
export const PROBLEM_TASKS: readonly DemoTask[] = [
  { id: 'p-1', title: 'Review the project proposal', effort: 45 },
  { id: 'p-2', title: 'Reply to customer emails', effort: 45 },
  { id: 'p-3', title: 'Team meeting', effort: 60 },
  { id: 'p-4', title: 'Prepare Thursday’s presentation', effort: 90 },
  { id: 'p-5', title: 'Review the monthly budget', effort: 60 },
  { id: 'p-6', title: 'Draft the launch email', effort: 60 },
  { id: 'p-7', title: 'Call the supplier back', effort: 20 },
  { id: 'p-8', title: 'One-to-one with Sam', effort: 30 },
  { id: 'p-9', title: 'Gym', effort: 60 },
  { id: 'p-10', title: 'Plan next week’s priorities', effort: 30 },
] as const

/** The day this list is being poured into: the app's own default capacity. */
export const PROBLEM_CAPACITY_MINUTES = DEMO_CAPACITY_MINUTES

/** Running total after the first `n` items have been counted. */
export function problemTotalAt(n: number): number {
  return PROBLEM_TASKS.slice(0, Math.max(0, Math.min(PROBLEM_TASKS.length, n))).reduce(
    (total, t) => total + t.effort,
    0,
  )
}

/**
 * The product's REAL capacity math over the first `n` items.
 *
 * Same function the signed-in Today meter calls. The section is not a drawing
 * of the feature, it is the feature, run over a fixed list.
 */
export function problemSummaryAt(n: number): CapacitySummary {
  return computeCapacity(problemTotalAt(n), PROBLEM_CAPACITY_MINUTES)
}

/** The finished state: everything counted. */
export function problemSummary(): CapacitySummary {
  return problemSummaryAt(PROBLEM_TASKS.length)
}
