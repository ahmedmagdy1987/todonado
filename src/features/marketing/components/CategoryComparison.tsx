import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Reveal } from '../demo/Reveal'
import {
  COMPARISON_COLUMNS,
  COMPARISON_FOOTNOTE,
  COMPARISON_ROWS,
  type Support,
} from '../comparison'

/**
 * THE CATEGORY COMPARISON.
 *
 * ── THE TABLE SCROLLS; THE PAGE NEVER DOES ─────────────────────────────────
 *
 * Five columns cannot fit 390px, and the two usual escapes are both worse than
 * this one. Dropping columns on mobile means the phone reader gets a different
 * and weaker argument than the desktop reader. Re-rendering the same data as
 * stacked cards means maintaining two markup paths for one dataset, which is
 * how the two drift.
 *
 * So it stays ONE real `<table>` inside its own `overflow-x-auto` container,
 * with the capability column pinned so you never lose track of which row you
 * are reading. The page itself must never scroll sideways, which is a separate
 * guarantee and is asserted in the E2E suite.
 *
 * ── WHY A REAL TABLE ───────────────────────────────────────────────────────
 *
 * A grid of divs would look identical and would tell a screen reader nothing.
 * With `<th scope>` on both axes, every cell announces its row and column, so
 * "partial" in the fifth row is heard as what it is. Each cell also carries
 * real text alongside the icon, because a bare tick is not a word.
 */

const LABEL: Record<Support, string> = {
  yes: 'Yes',
  partial: 'Partly',
  no: 'No',
}

function Cell({ value, highlight }: { value: Support; highlight?: boolean }) {
  return (
    <td
      className={cn(
        'border-b border-white/6 px-3 py-3.5 text-center align-middle',
        highlight && 'bg-brand/8',
      )}
    >
      <span className="sr-only">{LABEL[value]}</span>
      {value === 'yes' && (
        <Check
          aria-hidden
          className={cn('mx-auto h-4.5 w-4.5', highlight ? 'text-success' : 'text-text-primary/70')}
        />
      )}
      {value === 'partial' && (
        <span
          aria-hidden
          className="mx-auto block text-xs font-medium text-text-muted"
          title="Some tools in this category do this"
        >
          Some
        </span>
      )}
      {value === 'no' && <Minus aria-hidden className="mx-auto h-4 w-4 text-text-muted/30" />}
    </td>
  )
}

export function CategoryComparison() {
  return (
    <>
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Compare</p>
        <h2
          id="compare-title"
          className="mt-3 font-display text-2xl font-bold leading-[1.1] tracking-tight sm:text-3xl lg:text-4xl"
        >
          Where this sits next to what you already use
        </h2>
        <p className="mt-4 text-base leading-relaxed text-text-muted">
          Compared by kind of tool, not by brand. Most people are running three of these at once.
        </p>
      </div>

      <Reveal className="mt-10 sm:mt-14">
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <caption className="sr-only">
              What each kind of tool does, compared with Todonado
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 border-b border-white/10 bg-[#080b12] px-4 py-4 text-left font-display text-sm font-semibold"
                >
                  What you are trying to do
                </th>
                {COMPARISON_COLUMNS.map((col) => (
                  <th
                    key={col.name}
                    scope="col"
                    className={cn(
                      'border-b border-white/10 px-3 py-4 text-center align-bottom',
                      col.isTodonado && 'bg-brand/12',
                    )}
                  >
                    <span
                      className={cn(
                        'block font-display text-sm font-semibold',
                        col.isTodonado ? 'text-text-primary' : 'text-text-muted',
                      )}
                    >
                      {col.name}
                    </span>
                    <span className="mt-1 block text-[11px] font-normal leading-tight text-text-muted/70">
                      {col.role}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.capability} className="align-top">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-white/6 bg-[#080b12] px-4 py-3.5 text-left font-normal"
                  >
                    <span className="block max-w-[15rem] font-medium text-text-primary">
                      {row.capability}
                    </span>
                    {row.note && (
                      <span className="mt-1 block max-w-[19rem] text-xs leading-relaxed text-text-muted">
                        {row.note}
                      </span>
                    )}
                  </th>
                  {row.support.map((value, i) => (
                    <Cell
                      key={COMPARISON_COLUMNS[i].name}
                      value={value}
                      highlight={COMPARISON_COLUMNS[i].isTodonado}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>

      <p className="mx-auto mt-6 max-w-2xl text-center text-sm leading-relaxed text-text-muted">
        {COMPARISON_FOOTNOTE}
      </p>
    </>
  )
}
