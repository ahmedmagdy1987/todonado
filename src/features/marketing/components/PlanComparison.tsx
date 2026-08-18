import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENTITLEMENTS } from '@/features/billing/entitlements'

/**
 * FREE VERSUS PRO, AT THE LENGTH SOMEBODY WILL ACTUALLY READ.
 *
 * ── IT LISTS ONLY THE DIFFERENCES ──────────────────────────────────────────
 *
 * An earlier attempt at this table had seventeen rows and measured 1,857px on a
 * phone, and a good half of them were a tick in both columns. A row that is
 * identical on both plans is there to make the Pro column look long; it costs a
 * reader a line of attention to learn nothing, and it dilutes the four rows that
 * are the actual reason to pay.
 *
 * So the shared capabilities are stated ONCE, above the table, in a single
 * sentence, and the table below is differences only. That is both shorter and a
 * stronger argument: Free reads as generous rather than as a column of gaps.
 *
 * ── VALUES, NOT TICKS ──────────────────────────────────────────────────────
 *
 * Where a limit exists the cell states the number ("The last 30 days" against
 * "All of it"), because a number cannot be accused of spin the way a tick can,
 * and it tells a reader what they are actually getting instead of only whether
 * they are getting something.
 *
 * ── THE NUMBERS COME FROM THE ENTITLEMENT TABLE ────────────────────────────
 *
 * Free's caps are read from `ENTITLEMENTS.free.limits`, never typed in. The
 * public FAQ said "the last 14 days" of history for months after the real cap
 * became 30, because that number lived in prose in one place and in the
 * entitlement table in another. Anything a visitor reads that is also a value
 * in the contract is interpolated from the contract.
 *
 * ── MOBILE IS TWO REAL COLUMNS, NOT A SHRUNKEN TABLE ───────────────────────
 *
 * Below `md` the row label moves ABOVE its two values and the values keep a
 * half-width column each. Two columns is what fits legibly on a narrow screen,
 * and side-by-side is the entire job of this component, so an accordion or a
 * set of tabs would be actively wrong: they add a tap per row and hide the
 * comparison the reader came for. Nothing is horizontally scrollable and no
 * type is shrunk.
 */

interface PlanRow {
  capability: string
  free: string
  pro: string
  /** The four that are the actual reason to pay. Emphasised. */
  headline?: boolean
}

const { historyDays, personalTemplates, visionCards, mindMaps, quitHabits, activeChallenges } =
  ENTITLEMENTS.free.limits

/**
 * Stated once, above the table, so no row has to say it twice.
 *
 * "templates" became "the template catalog" because the cap row four rows below
 * says Free gets five templates. Both are true (the built-in catalog is
 * unlimited, your OWN saved templates are capped) and a reader scanning for
 * spin would have landed on the apparent contradiction.
 */
export const SHARED_LINE =
  'Both plans include unlimited tasks, projects and subtasks, the Day Capacity meter and its overbooking guard, Plan my day, roll-over, repeating tasks, focus and Pomodoro, the template catalog, the written journal, and the quit tracker.'

export const PLAN_ROWS: readonly PlanRow[] = [
  {
    capability: 'The week ahead',
    free: 'Not included',
    pro: 'Seven days at once, each with its own capacity, plus Plan my week',
    headline: true,
  },
  {
    // Named to match the reason card selling it ("Your patterns"), so a reader
    // persuaded upstairs can find the confirmation downstairs.
    capability: 'Your patterns',
    free: 'Not included',
    pro: 'Insights: planned time against actual time, and how your estimates are improving',
    headline: true,
  },
  {
    capability: 'Completed history',
    free: `The last ${historyDays} days`,
    pro: 'All of it, for as long as you keep the account',
    headline: true,
  },
  {
    capability: 'Calendar',
    free: 'Import a calendar file',
    pro: 'A calendar link that keeps itself up to date',
    headline: true,
  },
  /*
   * THE CAP ROW SITS IN THE MIDDLE, NOT LAST.
   *
   * It was the final row, so the last Pro argument a buyer read before the
   * price was "more mind maps" rather than the week or their history. It was
   * also the heaviest row on the table: its Free cell alone carried seven times
   * the ink of the week's, purely because it enumerates five numbers. Shorter
   * cells and an earlier position put it back behind the four that matter.
   */
  {
    capability: 'Personal limits',
    free: `${personalTemplates} templates · ${visionCards} goals · ${mindMaps} mind maps · ${quitHabits} habits · ${activeChallenges} challenge`,
    pro: 'No limits on any of them',
  },
  {
    capability: 'Daily briefing',
    free: 'Your day, your meetings, your streak and what carried over',
    pro: 'Arrives with the day already planned, ready to accept',
  },
  {
    capability: 'Journal',
    /*
     * "one a day" was here and had to go: this table is captioned as the
     * DIFFERENCES, so a limit stated only in the Free cell reads as one Pro
     * lifts. It does not. One entry per day is a UNIQUE constraint that applies
     * to both plans, and the real difference is already in the Pro cell.
     */
    free: 'Written entries',
    pro: 'Written entries and voice notes',
  },
] as const

function Value({ text, pro = false }: { text: string; pro?: boolean }) {
  if (text === 'Not included') {
    return <span className="text-text-muted/70">Not included</span>
  }
  return (
    <span className="inline-flex items-start gap-1.5">
      <Check
        className={cn('mt-[3px] h-3.5 w-3.5 shrink-0', pro ? 'text-brand' : 'text-success')}
        aria-hidden
      />
      <span className={pro ? 'text-text-primary' : 'text-text-muted'}>{text}</span>
    </span>
  )
}

export function PlanComparison({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p className="max-w-3xl text-base leading-relaxed text-text-primary/90">{SHARED_LINE}</p>

      {/* ── Desktop: label | Free | Pro ────────────────────────────────── */}
      <table className="mt-8 hidden w-full border-collapse text-left text-sm md:table">
        <caption className="sr-only">
          The differences between the Free plan and Pro. Everything not listed here is on both.
        </caption>
        <thead>
          <tr className="border-b border-white/10">
            <th scope="col" className="w-1/4 py-3 pr-4 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
              What changes
            </th>
            <th scope="col" className="w-[37.5%] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
              Free
            </th>
            <th
              scope="col"
              className="w-[37.5%] rounded-t-xl bg-brand/10 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-primary"
            >
              Pro
            </th>
          </tr>
        </thead>
        <tbody>
          {PLAN_ROWS.map((row) => (
            <tr key={row.capability} className="border-b border-white/5 align-top">
              <th
                scope="row"
                className={cn(
                  'py-4 pr-4 font-medium',
                  row.headline ? 'text-text-primary' : 'text-text-primary/80',
                )}
              >
                {row.capability}
              </th>
              <td className="px-4 py-4">
                <Value text={row.free} />
              </td>
              <td className="bg-brand/[0.06] px-4 py-4">
                <Value text={row.pro} pro />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Mobile: label above, two equal value columns ───────────────── */}
      <div className="mt-5 md:hidden">
        {/*
          Pinned under the header. Seven rows is more than one screen, and a
          column header that scrolls away leaves a reader deciding which of two
          unlabelled columns they are reading.
        */}
        <div className="sticky top-16 z-10 grid grid-cols-2 gap-3 border-b border-white/10 bg-background/95 py-2 backdrop-blur-sm">
          <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Free</p>
          <p className="font-mono text-[11px] uppercase tracking-wider text-brand">Pro</p>
        </div>
        <dl className="divide-y divide-white/5">
          {PLAN_ROWS.map((row) => (
            <div key={row.capability} className="py-2.5">
              <dt
                className={cn(
                  'text-sm font-semibold',
                  row.headline ? 'text-text-primary' : 'text-text-primary/80',
                )}
              >
                {row.capability}
              </dt>
              <dd className="mt-1.5 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Value text={row.free} />
                </div>
                <div>
                  <Value text={row.pro} pro />
                </div>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
