import { describe, expect, it } from 'vitest'
import {
  HERO_DAY,
  HERO_DAY_MINUTES,
  HERO_OPEN_MINUTES,
  HERO_PLANNED_MINUTES,
  heroProgressPercent,
} from './heroDay'

/**
 * The hero's day is the first thing a stranger sees, so the two things that can
 * quietly go wrong with it are pinned here: the arithmetic that makes the
 * completion story land on 100, and the BALANCE that stops the product looking
 * like a business tool.
 */

describe('the day is a life, not a workload', () => {
  /*
   * THE REGRESSION THIS EXISTS TO PREVENT.
   *
   * The hero shipped with five tasks and every one of them was work: a project
   * proposal, a team meeting, a budget review, a launch email and customer
   * calls. The owner's first reaction to the live page was that Todonado looked
   * like a business planner, and that list is why. It is an easy thing to drift
   * back into, because work tasks are the ones that come to mind when you are
   * writing example data at a desk.
   */
  it('spans at least five different parts of a life', () => {
    const categories = new Set(HERO_DAY.map((task) => task.category))
    expect(categories.size).toBeGreaterThanOrEqual(5)
  })

  it('is not mostly work', () => {
    const work = HERO_DAY.filter((task) => task.category === 'Work')
    expect(work.length).toBeLessThanOrEqual(Math.floor(HERO_DAY.length / 2))
  })

  it('is long enough to read as a real day and short enough to scan', () => {
    expect(HERO_DAY.length).toBeGreaterThanOrEqual(6)
    expect(HERO_DAY.length).toBeLessThanOrEqual(8)
  })

  /*
   * "Review the budget" is a task a person schedules, and that is all it may
   * ever be. Todonado has no money feature, so the hero must not carry a word
   * that implies one. This fails if anybody turns the task into a product
   * claim.
   */
  it('never implies a money feature Todonado does not have', () => {
    const text = HERO_DAY.map((task) => `${task.title} ${task.category}`).join(' ').toLowerCase()
    for (const claim of ['expense', 'expenses', 'tracker', 'spending', 'account balance']) {
      expect(text, `"${claim}" implies a capability that does not exist`).not.toContain(claim)
    }
  })

  it('gives every task a real estimate', () => {
    for (const task of HERO_DAY) {
      expect(task.minutes).toBeGreaterThan(0)
      expect(Number.isInteger(task.minutes)).toBe(true)
      expect(task.title.length).toBeGreaterThan(0)
      expect(task.category.length).toBeGreaterThan(0)
    }
  })
})

describe('the plan fits, which is the whole argument', () => {
  it('leaves the day some room rather than filling it', () => {
    expect(HERO_PLANNED_MINUTES).toBeLessThan(HERO_DAY_MINUTES)
    expect(HERO_OPEN_MINUTES).toBeGreaterThan(0)
  })

  it('derives the totals rather than restating them', () => {
    const summed = HERO_DAY.reduce((n, task) => n + task.minutes, 0)
    expect(HERO_PLANNED_MINUTES).toBe(summed)
    expect(HERO_OPEN_MINUTES).toBe(HERO_DAY_MINUTES - summed)
  })
})

describe('progress is progress, and it lands on 100', () => {
  it('starts at nothing', () => {
    expect(heroProgressPercent(0)).toBe(0)
  })

  /*
   * THE PAYOFF, PINNED. The old hero tracked planning LOAD, which tops out
   * around "nearly full" and can never resolve; this one tracks completion, so
   * the last task finishing is exactly the last planned minute. 99 would break
   * the entire point of the sequence.
   */
  it('ends at exactly 100, never a rounded 99', () => {
    expect(heroProgressPercent(HERO_DAY.length)).toBe(100)
  })

  it('rises monotonically, so the bar can never go backwards', () => {
    let previous = -1
    for (let done = 0; done <= HERO_DAY.length; done += 1) {
      const percent = heroProgressPercent(done)
      expect(percent).toBeGreaterThan(previous)
      previous = percent
    }
  })

  /*
   * COUNTED IN TASKS, AND THE TEST SAYS SO ON PURPOSE.
   *
   * Minutes-over-minutes would be more "effort-aware" and is the wrong choice
   * here: the card states the plan in minutes directly above ("5h 30m of 6h"),
   * so a second minutes reading makes the reader notice that the lower
   * denominator is the upper numerator. Tasks are a different unit, so the two
   * readings agree at a glance instead of needing reconciliation.
   */
  it('agrees exactly with the "n of 7 done" reading beside it', () => {
    for (let done = 0; done <= HERO_DAY.length; done += 1) {
      expect(heroProgressPercent(done)).toBe(
        done === HERO_DAY.length ? 100 : Math.round((done / HERO_DAY.length) * 100),
      )
    }
  })

  it('clamps instead of throwing on a count outside the day', () => {
    expect(heroProgressPercent(-3)).toBe(0)
    expect(heroProgressPercent(HERO_DAY.length + 5)).toBe(100)
  })
})
