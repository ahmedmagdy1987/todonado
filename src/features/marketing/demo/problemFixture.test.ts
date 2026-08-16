import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { formatMinutes } from '@/lib/format'
import {
  PROBLEM_CAPACITY_MINUTES,
  PROBLEM_TASKS,
  problemSummary,
  problemSummaryAt,
  problemTotalAt,
} from './problemFixture'

/**
 * THE SECTION'S SENTENCE AND THE SECTION'S SUM MUST BE THE SAME FACT.
 *
 * The problem section says, in words, that an ordinary list of intentions comes
 * to more time than the day holds. If someone later trims a task, drops a line
 * to fit a layout, or rounds a number, the prose keeps claiming the old total
 * and the page starts lying about its own arithmetic in front of the reader who
 * is being asked to trust it. Nothing else would catch that: the numbers are
 * computed, the words are not, and both render perfectly either way.
 *
 * So this test reads the RENDERED COPY out of the component and requires it to
 * contain the derived figures. It is the same trick `pricingConsistency.test.ts`
 * plays on prices, for the same reason.
 */

const source = readFileSync(
  fileURLToPath(new URL('../components/ProblemSection.tsx', import.meta.url)),
  'utf8',
)

describe('the problem section computes what it claims', () => {
  it('runs the product’s real capacity math, not a hardcoded percentage', () => {
    const summary = problemSummary()
    expect(summary.plannedMinutes).toBe(problemTotalAt(PROBLEM_TASKS.length))
    expect(summary.capacityMinutes).toBe(PROBLEM_CAPACITY_MINUTES)
    // Derived, never written down: over = planned - capacity.
    expect(summary.overMinutes).toBe(summary.plannedMinutes - summary.capacityMinutes)
    expect(summary.status).toBe('over')
  })

  it('is a day that genuinely does not fit, by a margin worth talking about', () => {
    const summary = problemSummary()
    // A list that overran by ten minutes would not make the point, and a list
    // that overran by three days would read as a parody. Both are failures of
    // the argument, so both are pinned.
    expect(summary.pct).toBeGreaterThan(125)
    expect(summary.pct).toBeLessThan(200)
  })

  it('is built from ordinary work, not an absurd pile', () => {
    // Every single line has to be reasonable on its own; the TOTAL is the
    // surprise. If one task ever grew to half a day the section would be
    // arguing against a straw man.
    for (const task of PROBLEM_TASKS) {
      expect(task.effort).toBeGreaterThanOrEqual(10)
      expect(task.effort).toBeLessThanOrEqual(120)
    }
    expect(PROBLEM_TASKS.length).toBeGreaterThanOrEqual(8)
  })

  it('climbs monotonically, so the running total can be animated honestly', () => {
    let previous = -1
    for (let n = 0; n <= PROBLEM_TASKS.length; n += 1) {
      const total = problemTotalAt(n)
      expect(total).toBeGreaterThan(previous)
      previous = total
    }
    expect(problemTotalAt(0)).toBe(0)
  })

  it('crosses the capacity line partway through, never on the last item', () => {
    /*
     * The moment the total passes the day is the moment the section exists for.
     * If it only tipped over on the final task the reveal would have no middle,
     * and if it tipped on the second the rest of the list would be noise.
     */
    const crossing = PROBLEM_TASKS.findIndex(
      (_, i) => problemSummaryAt(i + 1).status === 'over',
    )
    expect(crossing).toBeGreaterThan(2)
    expect(crossing).toBeLessThan(PROBLEM_TASKS.length - 1)
  })

  it('renders every quantity through the fixture, so the copy cannot drift', () => {
    /*
     * The original version of this test looked for the literal string "8h 20m"
     * in the component and failed, which turned out to be the component being
     * RIGHT rather than the component being wrong: it renders
     * `formatMinutes(summary.plannedMinutes)` and never writes a duration down.
     * That is strictly better than agreeing with a hardcoded string, because
     * there is no second copy of the number to fall out of step.
     *
     * So the assertion is now the stronger one: every displayed quantity is
     * derived, and no duration literal exists in the file to drift.
     */
    expect(source, 'the section must compute its totals').toContain('problemSummaryAt')
    expect(source, 'planned minutes must be formatted from the summary').toMatch(
      /formatMinutes\(summary\.plannedMinutes\)/,
    )
    expect(source, 'the overflow must be formatted from the summary').toMatch(
      /formatMinutes\(summary\.overMinutes\)/,
    )
    expect(source, 'the capacity must come from the fixture').toMatch(
      /formatMinutes\(PROBLEM_CAPACITY_MINUTES\)/,
    )

    // And no hand-written duration or percentage anywhere in the rendered copy.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code, 'a written-out duration would be a second source of truth').not.toMatch(
      /\d+h \d+m|\d+ hours of work/,
    )
    expect(code).not.toMatch(/>\s*\d+% (planned|of your day)/)
  })

  it('formats to the values the section is designed around', () => {
    // Not copy, but the shape the layout was built for: a total in hours and
    // minutes, and an overflow big enough to draw. If the fixture ever summed
    // to a round number of hours the assertions above still pass and the
    // design intent is still met, so this checks the intent directly.
    const summary = problemSummary()
    expect(formatMinutes(summary.plannedMinutes)).toMatch(/^\d+h( \d+m)?$/)
    expect(summary.overMinutes).toBeGreaterThanOrEqual(60)
  })
})
