/**
 * THE DAY THE HERO SHOWS, AS DATA.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY ────────────────────────────────────────
 *
 * The hero used to borrow `HERO_STEPS` from `landingDemo.ts`, a fixture written
 * for a meter that filled itself. That list was five items long and every one
 * of them was work: "Write the project proposal", "Team meeting", "Review the
 * budget", "Draft the launch email", "Customer calls". The first thing a
 * stranger saw was therefore a business tool, which is not what Todonado is
 * for. The old fixture still serves the old widgets; this one serves the hero,
 * and keeping them apart means changing the day a visitor sees cannot quietly
 * change a unit-tested demo somewhere else.
 *
 * ── IT IS A LIFE, NOT A WORKLOAD ───────────────────────────────────────────
 *
 * Seven items across six parts of a life: health, work, errands, family, money
 * and something for yourself. Work is two of the seven, which is roughly what
 * a real weekday looks like and is the entire point of the change. Nothing here
 * is aspirational or impressive; it is a Tuesday.
 *
 * "Review the budget" is a TASK SOMEBODY SCHEDULES, exactly as it would be in
 * any planner. It is deliberately not a claim that Todonado has budgeting,
 * because Todonado does not. No money feature is implied, named or drawn.
 *
 * ── THE ARITHMETIC IS LOAD-BEARING ─────────────────────────────────────────
 *
 * The seven estimates total 330 minutes against a 360 minute day, so the plan
 * leaves 30 minutes open. That is the product's whole thesis in three numbers,
 * and it is why the hero can show a day being FINISHED without abandoning the
 * realistic-time argument: the day gets done because it was a day that fit.
 */

export interface HeroTask {
  id: string
  title: string
  /** One word, shown as a quiet label. Six of them, so the day reads as a life. */
  category: string
  minutes: number
}

/** Minutes in the demo day. The same 6h a real new account starts with. */
export const HERO_DAY_MINUTES = 360

/**
 * In the order a day actually happens, which is also the order they complete.
 * Gym first, reading last; the working block in the middle where it belongs.
 */
export const HERO_DAY: readonly HeroTask[] = [
  { id: 'h1', title: 'Gym session', category: 'Health', minutes: 45 },
  { id: 'h2', title: 'Project proposal', category: 'Work', minutes: 90 },
  { id: 'h3', title: 'Team meeting', category: 'Work', minutes: 45 },
  { id: 'h4', title: 'Pick up groceries', category: 'Errands', minutes: 30 },
  { id: 'h5', title: 'Call Mom', category: 'Family', minutes: 15 },
  { id: 'h6', title: 'Review the budget', category: 'Money', minutes: 45 },
  { id: 'h7', title: 'Read before bed', category: 'Personal', minutes: 60 },
] as const

/** 330 of 360. Computed, never written down twice. */
export const HERO_PLANNED_MINUTES = HERO_DAY.reduce((n, task) => n + task.minutes, 0)

/** 30. What the plan deliberately left alone. */
export const HERO_OPEN_MINUTES = HERO_DAY_MINUTES - HERO_PLANNED_MINUTES

/**
 * Percent of the plan finished after `done` tasks.
 *
 * ── THIS IS PROGRESS, NOT LOAD, AND THAT DISTINCTION IS THE FIX ────────────
 *
 * The hero used to show "92% planned", which is 330/360: how much of the day
 * had been SPOKEN FOR. It is a real number and the product needs it, but as the
 * headline of a hero it is a dead end. It can only ever approach "full", so the
 * visual settled on an amber "nearly full" warning and stopped: a visitor
 * watched a day get booked up and then nothing happened.
 *
 * The two numbers do not merely differ, they move in OPPOSITE directions. The
 * real app's meter counts remaining incomplete effort (`TodayPage.tsx` says so
 * in as many words: "Capacity reflects remaining (incomplete) effort, so a
 * finished day reads as clear"), so in the product a finished day empties the
 * planning meter to zero. One bar could never tell both stories.
 *
 * ── COUNTED IN TASKS, ON PURPOSE ───────────────────────────────────────────
 *
 * The obvious alternative is minutes finished over minutes planned. It is more
 * "effort-aware", and it is worse here: the hero already states the plan in
 * minutes directly above ("5h 30m of 6h"), so a second minutes-over-minutes
 * reading forces the reader to notice that the lower denominator is the upper
 * numerator. That is a legend in disguise. Tasks are a different unit, so there
 * is nothing to reconcile and the two readings agree at a glance: seven of
 * seven is a hundred percent, and both are on screen saying it.
 */
export function heroProgressPercent(done: number): number {
  const clamped = Math.max(0, Math.min(HERO_DAY.length, done))
  // Exact, never a rounded 99: the last task IS the last of the plan.
  if (clamped === HERO_DAY.length) return 100
  return Math.round((clamped / HERO_DAY.length) * 100)
}
