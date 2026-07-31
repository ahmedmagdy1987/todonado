import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_PLAN_SCOPE, PLAN_SCOPES, type PlanScope } from './planScope'

/**
 * Which pool the planner draws from, remembered PER USER.
 *
 * ── WHY LOCALSTORAGE, KEYED BY USER ID ───────────────────────────────────────
 * Storing this on `profiles` would be the tidier answer, and it is the one to
 * reach for the next time a migration is being applied anyway — the setting is
 * a property of the ACCOUNT, not the machine, so it should follow you to your
 * phone. It is here instead because adding a column means a migration, and an
 * unapplied migration would leave the control silently broken for whoever
 * pulled the code before running it. A setting that costs one tap to re-pick is
 * not worth that.
 *
 * Keyed by user id rather than a single shared key, because two people on one
 * browser are two different backlogs, and inheriting a stranger's planning rule
 * is worse than having no memory at all.
 *
 * Follows the repo's existing convention (`todonado.<key>`, hand-rolled
 * read/write in try/catch — see `prefs.ts` and the digest dismissal) rather than
 * inventing a storage abstraction for one enum.
 */

const KEY_PREFIX = 'todonado.planScope.'

function isPlanScope(value: unknown): value is PlanScope {
  return typeof value === 'string' && (PLAN_SCOPES as readonly string[]).includes(value)
}

export function readPlanScope(userId: string): PlanScope {
  if (!userId) return DEFAULT_PLAN_SCOPE
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${userId}`)
    return isPlanScope(raw) ? raw : DEFAULT_PLAN_SCOPE
  } catch {
    // Private mode, or storage disabled. The default is the behaviour that
    // works, so falling back to it costs nothing.
    return DEFAULT_PLAN_SCOPE
  }
}

export function writePlanScope(userId: string, scope: PlanScope): void {
  if (!userId) return
  try {
    localStorage.setItem(`${KEY_PREFIX}${userId}`, scope)
  } catch {
    /* the plan still works this session; only the memory is lost */
  }
}

export function usePlanScope(userId: string): [PlanScope, (next: PlanScope) => void] {
  const [scope, setScope] = useState<PlanScope>(() => readPlanScope(userId))

  // The id arrives after auth resolves, so the first read can be for ''. Re-read
  // once it is real rather than leaving the user on the default.
  useEffect(() => {
    setScope(readPlanScope(userId))
  }, [userId])

  const update = useCallback(
    (next: PlanScope) => {
      setScope(next)
      writePlanScope(userId, next)
    },
    [userId],
  )

  return [scope, update]
}
