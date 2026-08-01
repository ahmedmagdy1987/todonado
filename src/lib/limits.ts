/**
 * Length limits for the tables that predate the caps convention.
 *
 * ── WHY THESE EXIST HERE FIRST ───────────────────────────────────────────────
 * Every table added from 2026-07-28 onward carries size CHECKs in its migration
 * and a matching client constant, pinned together by a test so the two cannot
 * drift (`personalCaps.test.ts`, `quitCaps.test.ts`, `mindMapCaps.test.ts`).
 * The tables that came BEFORE that convention have neither: `tasks.title` has
 * no database constraint and, until now, not even a `maxLength` on the input.
 *
 * CLAUDE.md's rule is "the client is assumed hostile; never rely on client-side
 * filtering", so these are explicitly the WEAKER half of the fix. The database
 * half is `supabase/migrations/20260801120000_length_caps.sql`, committed and
 * deliberately NOT applied — applying it is a decision with a table lock
 * attached, and it is the owner's to schedule.
 *
 * What this half does buy, today:
 *   • the accidental case (a paste of a whole document into a task title) stops
 *     being possible through the UI;
 *   • a user who tries it gets a friendly, specific message instead of a row
 *     that renders as a wall of text on every surface that lists it;
 *   • and when the SQL is applied, nothing a user can type is suddenly rejected
 *     by the database, because these numbers ARE those numbers.
 *
 * `limits.test.ts` reads that migration constraint by constraint and asserts
 * every value below matches it. That is what stops the two halves drifting
 * between now and the day it runs.
 */

export const LIMITS = {
  /** `tasks.title` */
  taskTitle: 500,
  /** `tasks.notes` */
  taskNotes: 20_000,
  /** `projects.name` */
  projectName: 200,
  /** `sections.name` */
  sectionName: 200,
  /** `subtasks.title` */
  subtaskTitle: 500,
  /** `profiles.display_name` and `profiles.full_name` */
  profileName: 120,
  /** `wellness_items.name`, `.dose`, `.schedule` */
  wellnessShort: 200,
  /** `wellness_items.notes` */
  wellnessNotes: 2_000,
  /** `calendar_sources.label` */
  calendarLabel: 200,
  /** `calendar_sources.url` */
  calendarUrl: 2_048,
} as const

export type LimitKey = keyof typeof LIMITS

/**
 * A friendly refusal, used where silently truncating would lose someone's work.
 *
 * `maxLength` on an input is the right tool for typing — it simply stops. It is
 * the WRONG tool for a paste of something long, because the browser truncates
 * without a word and the user finds out later. Where the value matters (a task
 * title, a note), the caller checks and says so.
 */
export function tooLongMessage(what: string, limit: number, actual: number): string {
  return `That ${what} is ${actual.toLocaleString()} characters. The limit is ${limit.toLocaleString()}, so please shorten it.`
}

/** null when it fits, a ready-to-show message when it does not. */
export function checkLength(what: string, value: string | null | undefined, limit: number): string | null {
  if (value == null) return null
  return value.length > limit ? tooLongMessage(what, limit, value.length) : null
}
