/**
 * Field size caps for the quit tracker.
 *
 * These are the CLIENT twins of the CHECK constraints in
 * `supabase/migrations/20260730120000_quit_habits.sql`. They live here — one
 * place, imported by the dialog — for the same reason the personal-template
 * caps do: if the client were the looser of the two, a user could type
 * something that looks fine and get an opaque Postgres `23514` back instead of
 * a `maxLength` that simply stops them. `quitCaps.test.ts` reads the migration
 * and asserts each constant equals its CHECK, so the two cannot drift.
 */

/** `quit_habits.name` — CHECK char_length(btrim(name)) between 1 and 60. */
export const MAX_QUIT_NAME = 60

/** `quit_habits.replacement_action` — CHECK char_length(...) <= 140. */
export const MAX_QUIT_REPLACEMENT = 140

/** `quit_habits.notes` — CHECK char_length(notes) <= 500. */
export const MAX_QUIT_NOTES = 500
