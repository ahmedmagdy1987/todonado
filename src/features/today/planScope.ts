import type { Task } from '@/types/database'

/**
 * WHAT THE PLANNER IS ALLOWED TO PULL FROM, and in what order.
 *
 * ── THE BUG THIS MODULE EXISTS TO FIX ────────────────────────────────────────
 * Eligibility used to read, in both planners:
 *
 *     return projectless || overdue || due
 *
 * so a task became plannable only if it had no project, or was already late, or
 * carried a deadline. ORDINARY PROJECT WORK WITH NO DUE DATE MATCHED NONE OF
 * THEM, and there is no fourth branch — which means it was not "ranked low", it
 * was invisible, permanently. A user who organises work into projects and does
 * not set deadlines (the common case, and the one the onboarding actively
 * encourages) could have a hundred open tasks and be told there was nothing to
 * plan, every single day, forever.
 *
 * The old test suite asserted this as correct behaviour
 * (`isPlanCandidate({ project_id: 'p' }) === false`, "project backlog, not
 * due"), which is why it survived: the rule was deliberate, and the deliberation
 * was wrong. The fear behind it was real — dumping an entire backlog onto
 * someone — but CAPACITY already prevents that. The planner never exceeds the
 * day's remaining minutes, so widening what it may consider cannot make it
 * schedule more; it can only make it schedule something rather than nothing.
 *
 * ── THE TWO SCOPES ───────────────────────────────────────────────────────────
 * `all` is the default because the complaint was emptiness, and because it is
 * safe: capacity is the real limit. `dated` exists for people who plan strictly
 * by deadline and want the planner to leave the backlog alone.
 *
 * ── THE ORDER ────────────────────────────────────────────────────────────────
 * Deadlines first, then intent, then size. Tiers before attributes, so the
 * ordering is explainable in one sentence: overdue work, then dated work by
 * deadline, then project work without a date, then loose capture. Priority,
 * deadline and effort break ties INSIDE a tier — a task due in three months
 * still outranks an undated one, because a date is a commitment and no date is
 * not.
 */

export const PLAN_SCOPES = ['dated', 'all'] as const
export type PlanScope = (typeof PLAN_SCOPES)[number]

/**
 * Include the backlog unless told otherwise.
 *
 * The narrower rule is what produced "nothing to plan" on a full workspace, so
 * a user who never opens the setting must get the behaviour that works.
 */
export const DEFAULT_PLAN_SCOPE: PlanScope = 'all'

export const PLAN_SCOPE_LABEL: Record<PlanScope, string> = {
  dated: 'Dated work only',
  all: 'Everything I have',
}

export const PLAN_SCOPE_HINT: Record<PlanScope, string> = {
  dated: 'Only what is overdue or has a deadline.',
  all: 'Deadlines first, then anything else that fits.',
}

const isOpen = (t: Task) => t.status === 'todo' || t.status === 'in_progress'

/** Sorts after every real date, so undated work lands last within its tier. */
export const UNDATED = '9999-12-31'

/**
 * Already committed to a day, so the planner leaves it alone.
 *
 * Today counts: a task on today is on the plan already, and re-planning it
 * would double-count it against capacity.
 */
export function isAlreadyPlanned(task: Task, todayStr: string): boolean {
  return isOpen(task) && task.scheduled_for != null && task.scheduled_for >= todayStr
}

/**
 * May this task be pulled into a plan?
 *
 * `horizon` is the last day the plan covers — today for `planDay`, the seventh
 * day for `planWeek`. It only narrows the `dated` scope; `all` ignores it,
 * because a task with a distant deadline is still work you could do now.
 */
export function isPlannable(
  task: Task,
  todayStr: string,
  scope: PlanScope,
  horizon: string = todayStr,
): boolean {
  if (!isOpen(task)) return false
  // Never disturb an existing plan, in or beyond the window.
  if (task.scheduled_for != null && task.scheduled_for >= todayStr) return false
  if (scope === 'all') return true

  const overdue = task.scheduled_for != null && task.scheduled_for < todayStr
  const dueByHorizon = task.due_date != null && task.due_date <= horizon
  return overdue || dueByHorizon
}

export const PLAN_TIER = {
  /** Late: a missed schedule or a passed deadline. */
  overdue: 0,
  /** Carries a deadline that has not passed. */
  dated: 1,
  /** Deliberate work with no date on it. */
  projectUndated: 2,
  /** Loose capture — the Inbox. */
  inboxUndated: 3,
} as const

export type PlanTier = (typeof PLAN_TIER)[keyof typeof PLAN_TIER]

export function planTier(task: Task, todayStr: string): PlanTier {
  const lateSchedule = task.scheduled_for != null && task.scheduled_for < todayStr
  const lateDue = task.due_date != null && task.due_date < todayStr
  if (lateSchedule || lateDue) return PLAN_TIER.overdue
  if (task.due_date != null) return PLAN_TIER.dated
  if (task.project_id != null) return PLAN_TIER.projectUndated
  return PLAN_TIER.inboxUndated
}

export interface Costed {
  task: Task
  cost: number
}

/**
 * The total order both planners use. Deterministic to the last comparison —
 * ties break on id, so the same input always produces the same plan and a
 * preview can never disagree with what Accept then writes.
 */
export function comparePlanOrder(a: Costed, b: Costed, todayStr: string): number {
  const ta = planTier(a.task, todayStr)
  const tb = planTier(b.task, todayStr)
  if (ta !== tb) return ta - tb
  if (b.task.priority !== a.task.priority) return b.task.priority - a.task.priority
  const ad = a.task.due_date ?? UNDATED
  const bd = b.task.due_date ?? UNDATED
  if (ad !== bd) return ad < bd ? -1 : 1
  if (a.cost !== b.cost) return a.cost - b.cost
  return a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0
}

export interface ScopeCensus {
  /** Open tasks the CURRENT scope will consider. */
  eligible: number
  /** Open tasks only the WIDER scope would consider — the "include these?" offer. */
  excludedByScope: number
  /** Open tasks already sitting on today or a future day. */
  alreadyPlanned: number
}

/**
 * Count what each scope can see, so an empty plan can say WHY.
 *
 * "Nothing to plan" is only ever true in one of three different situations, and
 * they need three different answers: there is genuinely no open work; the work
 * exists but is all already scheduled; or the work exists and the current scope
 * is hiding it. The third is the one that made the planner feel broken, and it
 * is the only one with a one-tap fix.
 */
export function censusFor(
  tasks: Task[],
  todayStr: string,
  scope: PlanScope,
  horizon: string = todayStr,
): ScopeCensus {
  let eligible = 0
  let excludedByScope = 0
  let alreadyPlanned = 0

  for (const task of tasks) {
    if (!isOpen(task)) continue
    if (isAlreadyPlanned(task, todayStr)) {
      alreadyPlanned += 1
      continue
    }
    if (isPlannable(task, todayStr, scope, horizon)) eligible += 1
    else if (isPlannable(task, todayStr, 'all', horizon)) excludedByScope += 1
  }

  return { eligible, excludedByScope, alreadyPlanned }
}
