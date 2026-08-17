import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Reveal } from '../demo/Reveal'
import { PLAN_MATRIX, type PlanCell } from '../planMatrix'

/**
 * FREE VS PRO, ONE ROW PER CAPABILITY.
 *
 * ── WHY A TABLE AND NOT TWO BULLET LISTS ───────────────────────────────────
 *
 * The pricing cards answer "what does Free include" and "what does Pro add".
 * Neither answers the question a visitor is actually holding, which is
 * comparative: "if I do not pay, what do I not get?" Answering that from two
 * separate lists means keeping both in your head and diffing them, which is
 * work, and work at exactly the moment you are deciding whether to bother.
 *
 * ── THIS TABLE IS ALLOWED TO BE UNFLATTERING ───────────────────────────────
 *
 * Most rows are identical on both plans, and it says so plainly rather than
 * hiding the symmetry. That is the honest shape of this product: nearly
 * everything is free. A table engineered to look lopsided would be a different
 * product's table, and anyone who then signed up would notice within a day.
 *
 * The three rows that carry the paid argument are marked `decisive` and given
 * a visible accent, so the eye lands on the real difference instead of having
 * to find it among the ticks.
 *
 * ── STACKED ON MOBILE, TABULAR ON DESKTOP ──────────────────────────────────
 *
 * Unlike the category comparison, this one is only two columns wide, so it
 * genuinely fits a phone as a table without scrolling. It stays one `<table>`
 * with `<th scope>` on both axes; only the cell padding and the per-row note
 * placement change with width.
 */

/*
 * THE WORD "INCLUDED" IS HIDDEN ON A PHONE, AND THE TICK IS NOT.
 *
 * At 390px the capability column is about 190px wide, so every cell that said
 * "Included" wrapped onto two lines and dragged the whole row's height with it,
 * to convey exactly what the tick beside it already conveyed. A cell carrying
 * real information ("Last 14 days", "Sample week", "Unlimited") always shows
 * its text at every width, because there the words ARE the answer.
 *
 * The full label is always in the accessible name either way, so nothing is
 * lost to a screen reader at any width.
 */
function Value({ cell, emphasise }: { cell: PlanCell; emphasise?: boolean }) {
  if (cell.kind === 'no') {
    return (
      <>
        <span className="sr-only">Not included</span>
        <Minus aria-hidden className="mx-auto h-4 w-4 text-text-muted/30" />
      </>
    )
  }
  const generic = cell.kind === 'yes' && cell.label === 'Included'
  return (
    <span
      className={cn(
        'inline-flex flex-col items-center justify-center gap-0.5 text-xs leading-snug sm:flex-row sm:gap-1.5',
        cell.kind === 'yes' && emphasise ? 'text-text-primary' : 'text-text-muted',
      )}
    >
      <span className="sr-only">{cell.label}</span>
      {cell.kind === 'yes' && (
        <Check
          aria-hidden
          className={cn('h-4 w-4 shrink-0', emphasise ? 'text-success' : 'text-success/70')}
        />
      )}
      <span aria-hidden className={cn(generic && 'hidden sm:inline')}>
        {cell.label}
      </span>
    </span>
  )
}

export function PlanTable() {
  return (
    <>
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Free vs Pro</p>
        <h2
          id="plans-title"
          className="mt-3 font-display text-2xl font-bold leading-[1.1] tracking-tight sm:text-3xl lg:text-4xl"
        >
          Exactly what you get, either way
        </h2>
        <p className="mt-4 text-base leading-relaxed text-text-muted">
          Most of this list is the same on both plans, and that is on purpose. You should be able
          to run a good day without paying anything.
        </p>
      </div>

      <Reveal className="mt-10 sm:mt-14">
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Every capability, and what the Free and Pro plans each include
            </caption>
            <thead>
              <tr className="bg-surface-2/50">
                <th scope="col" className="px-4 py-3.5 font-display text-sm font-semibold sm:px-5">
                  Capability
                </th>
                <th
                  scope="col"
                  className="w-[22%] px-2 py-3.5 text-center font-display text-sm font-semibold sm:w-[22%] sm:px-3"
                >
                  Free
                </th>
                <th
                  scope="col"
                  className="w-[22%] bg-brand/10 px-2 py-3.5 text-center font-display text-sm font-semibold sm:w-[22%] sm:px-3"
                >
                  Pro
                </th>
              </tr>
            </thead>

            {PLAN_MATRIX.map((group) => (
              <tbody key={group.name}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={3}
                    className="border-y border-white/8 bg-background/60 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted sm:px-5"
                  >
                    {group.name}
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr
                    key={row.capability}
                    className={cn('align-top', row.decisive && 'bg-brand/[0.045]')}
                  >
                    <th
                      scope="row"
                      className="border-b border-white/6 px-4 py-3.5 font-normal sm:px-5"
                    >
                      <span
                        className={cn(
                          'block text-sm leading-snug',
                          row.decisive
                            ? 'font-medium text-text-primary'
                            : 'text-text-primary/90',
                        )}
                      >
                        {row.capability}
                      </span>
                      {/* Hidden below `sm`: at 390px a note wraps to three or
                          four lines in a 190px column and roughly doubles the
                          row, to add colour to a fact the row already states.
                          The desktop reader, who is scanning rather than
                          scrolling past, keeps it. */}
                      {row.note && (
                        <span className="mt-1 hidden text-xs leading-relaxed text-text-muted sm:block">
                          {row.note}
                        </span>
                      )}
                    </th>
                    <td className="border-b border-white/6 px-2 py-3.5 text-center sm:px-3">
                      <Value cell={row.free} />
                    </td>
                    <td className="border-b border-white/6 bg-brand/[0.07] px-2 py-3.5 text-center sm:px-3">
                      <Value cell={row.pro} emphasise />
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Reveal>
    </>
  )
}
