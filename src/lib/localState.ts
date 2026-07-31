/**
 * What signing out takes with it, and what it deliberately leaves behind.
 *
 * ── THE PROBLEM ──────────────────────────────────────────────────────────────
 * Every piece of local state this app keeps is namespaced `todonado.`, and none
 * of it was cleared at sign-out. On a shared or public browser the next person
 * inherited the previous account's dismissed briefing, its pomodoro, and —
 * because the planning-scope key embeds the account uuid — a list of which
 * accounts had used the machine. A uuid is not a credential and grants nothing
 * on its own; it is remanence, not access. Still nothing to leave lying around.
 *
 * ── THE DISTINCTION THAT MATTERS ─────────────────────────────────────────────
 * `todonado.prefs` STAYS. It holds sound, volume, chime tone and which screen
 * this browser opens on, and `prefs.ts` is explicit that these are properties of
 * the DEVICE rather than the account: "which machine is allowed to make a noise
 * is a property of the machine". Wiping them at sign-out would mean a shared
 * laptop silently resetting its own audio settings every time anybody left,
 * which is a worse outcome than the remanence this function exists to fix.
 *
 * Everything else is about a person: their day, their dismissals, their plan.
 */

/** The one namespaced key that belongs to the browser, not to whoever signed in. */
const DEVICE_KEYS = ['todonado.prefs']

const NAMESPACE = 'todonado.'

/**
 * Remove every account-scoped local key. Returns what it removed, which is what
 * makes it testable without a DOM.
 */
export function clearAccountLocalState(storage: Storage | undefined = safeStorage()): string[] {
  if (!storage) return []
  const doomed: string[] = []
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (!key || !key.startsWith(NAMESPACE)) continue
      if (DEVICE_KEYS.includes(key)) continue
      doomed.push(key)
    }
    // Collected first, then removed: removing during the walk shifts the indices
    // underneath it and silently skips every other key.
    for (const key of doomed) storage.removeItem(key)
  } catch {
    /* private mode, or storage disabled — nothing to clear and nothing to fix */
  }
  return doomed
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}
