/**
 * WHY THIS IS A COMPARISON OF CATEGORIES AND NOT OF PRODUCTS.
 *
 * ── THE HONEST REASON, NOT THE CONVENIENT ONE ──────────────────────────────
 *
 * Naming competitors here would be unfair in a way that would eventually be
 * noticed. A packaging study on 2026-08-17 read the current official pricing
 * pages of eight products in and around this space, and the three built on the
 * same thesis as Todonado (daily planning against real capacity) DO essentially
 * all of what is claimed below as a difference. They simply have no free tier
 * at all and charge between three and seven times as much. A row of empty cells
 * beside their names would be false.
 *
 * The products that a feature table WOULD flatter Todonado against are the
 * to-do lists and boards, and those are not really rivals: they answer a
 * different question. Putting them in a grid and colouring our column green
 * would be picking a fight with tools that are good at what they do.
 *
 * So the comparison is by CATEGORY, which is the true claim: a list, a board, a
 * calendar and a timer each solve one part of a day, and the argument is that
 * the parts are worth more connected than separately.
 *
 * `e2e/marketing.spec.ts` independently forbids naming any competitor anywhere
 * a visitor can read, so this is enforced rather than merely intended.
 *
 * ── THE RULE FOR EVERY CELL ────────────────────────────────────────────────
 *
 * `partial` is used generously and on purpose. A table where every rival cell
 * is empty and every Todonado cell is a tick reads as marketing, and a reader
 * who knows one of these categories well will spot the exaggeration and stop
 * trusting the rest of the page. Where a category commonly does something, it
 * gets credit for it, including where that makes a row less flattering.
 */

export type Support = 'yes' | 'partial' | 'no'

export interface ComparisonColumn {
  /** A category, never a brand. */
  name: string
  /** What this kind of tool is for, in its own terms. */
  role: string
  /** Rendered as the highlighted column. */
  isTodonado?: boolean
}

export interface ComparisonRow {
  /** Phrased as a job a person is trying to get done. */
  capability: string
  /** One per column, in column order. */
  support: Support[]
  /** Shown under the row on mobile, where a grid of ticks explains nothing. */
  note?: string
}

export const COMPARISON_COLUMNS: ComparisonColumn[] = [
  { name: 'A to-do list', role: 'Remembering everything' },
  { name: 'A board or wiki', role: 'Organising the work' },
  { name: 'A calendar', role: 'Knowing when things happen' },
  { name: 'A focus timer', role: 'Getting the hour done' },
  { name: 'Todonado', role: 'Committing to a day that fits', isTodonado: true },
]

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    capability: 'Capture anything and organise it',
    support: ['yes', 'yes', 'no', 'no', 'yes'],
    note: 'Table stakes. Lists and boards are good at this, and so is Todonado.',
  },
  {
    capability: 'Repeat, prioritise and set deadlines',
    support: ['yes', 'partial', 'partial', 'no', 'yes'],
    note: 'Also table stakes, and not a reason to switch.',
  },
  {
    capability: 'Know how long each task will take',
    support: ['partial', 'no', 'partial', 'no', 'yes'],
    note: 'A calendar knows how long a meeting is. Almost nothing knows how long your tasks are, and that is the number the rest of this depends on.',
  },
  {
    capability: 'Add up the day and say it does not fit',
    support: ['no', 'no', 'no', 'no', 'yes'],
    note: 'A list will happily let you plan fourteen hours into eight. This is the part that refuses.',
  },
  {
    capability: 'Time the work you actually do',
    support: ['partial', 'no', 'no', 'yes', 'yes'],
    note: 'Some list apps do include a timer. A dedicated one does it better than either.',
  },
  {
    capability: 'Compare what you planned with what it really took',
    support: ['no', 'no', 'no', 'partial', 'yes'],
    note: 'A timer can tell you an hour passed. Connecting that back to the estimate you made is the part that changes tomorrow.',
  },
  {
    capability: 'Carry unfinished work forward without starting over',
    support: ['partial', 'no', 'no', 'no', 'yes'],
  },
  {
    capability: 'All of it in one place, on one subscription',
    support: ['no', 'no', 'no', 'no', 'yes'],
    note: 'The usual answer is three or four tools that do not know about each other.',
  },
]

/**
 * The line that keeps the section from reading as an attack.
 *
 * It is also just true: the categories above are good at their jobs, and most
 * people reading this are using two or three of them happily.
 */
export const COMPARISON_FOOTNOTE =
  'None of these are bad tools. They answer a different question. A list asks what you have to do; Todonado asks what actually fits today, and then helps you do it.'
