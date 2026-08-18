import { Check, Minus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * WHERE TODONADO SITS AMONG THE TOOLS PEOPLE ALREADY USE.
 *
 * ── CATEGORIES, NEVER BRANDS ───────────────────────────────────────────────
 *
 * No product is named here, and that is a rule rather than a preference. A
 * named comparison is out of date the week a competitor ships, it makes the
 * page about them, and `e2e/marketing.spec.ts` already fails the build if a
 * competitor's name appears anywhere a visitor can read. Categories are also
 * simply more honest: "a task app" describes what the reader already has open
 * in another tab, whatever its name is.
 *
 * ── THE TABLE IS NOT RIGGED, AND THE LOSSES ARE THE PROOF ──────────────────
 *
 * Todonado is not "yes" in every row of its own column, because a comparison
 * where the author wins everything is read as an advert and discarded. Task
 * apps genuinely win at capture. Calendars genuinely know how much of your day
 * is already gone. Focus timers genuinely track real elapsed time. Each of
 * those is marked as such.
 *
 * `partial` is used where a category CAN do something but not as the job
 * described: a board can hold an estimate field, but nothing in it tells you
 * the estimates no longer fit in a day.
 *
 * Two cells carry "(Pro)" because the capability is real but paid, and a
 * comparison table that quietly counts paid features as included would be the
 * same dishonesty in the other direction.
 */

type Verdict = 'yes' | 'partial' | 'no'

const CATEGORIES = ['A task app', 'A board or workspace', 'A focus timer', 'A calendar'] as const

interface JobRow {
  /** The job a person is trying to get done. */
  job: string
  /** Verdicts in CATEGORIES order. */
  others: readonly [Verdict, Verdict, Verdict, Verdict]
  todonado: Verdict
  /** Shown against the Todonado verdict when the capability is paid. */
  proNote?: boolean
  /** A short qualifier printed in the Todonado cell. */
  note?: string
}

export const JOB_ROWS: readonly JobRow[] = [
  /*
   * "Capture and organise work" used to open this table and was cut: a task app
   * and a board both do it perfectly well, so the row separated nothing and
   * cost a reader a line. A comparison earns its length by the rows where the
   * answers differ.
   */
  {
    job: 'Put a time estimate on each task',
    others: ['partial', 'partial', 'no', 'partial'],
    todonado: 'yes',
  },
  {
    job: 'Know what actually fits in today',
    others: ['no', 'no', 'no', 'partial'],
    todonado: 'yes',
  },
  {
    job: 'Plan a week against real capacity',
    others: ['no', 'partial', 'no', 'partial'],
    todonado: 'yes',
    proNote: true,
  },
  {
    job: 'Work the plan in a focus timer',
    others: ['no', 'no', 'yes', 'no'],
    todonado: 'yes',
  },
  {
    job: 'Compare planned time with actual time',
    others: ['no', 'partial', 'partial', 'no'],
    todonado: 'yes',
    proNote: true,
  },
  {
    job: 'Move unfinished work forward on purpose',
    others: ['partial', 'partial', 'no', 'no'],
    todonado: 'yes',
  },
  {
    /*
     * THE ROW TODONADO LOSES, AND IT IS HERE ON PURPOSE.
     *
     * Push notifications and email reminders are not built (Settings says so in
     * the app, in as many words), so every one of these categories genuinely
     * beats us at nudging you at a moment you are not already looking. A table
     * whose author wins every row is read as an advert and discarded; one
     * conceded loss is what makes the other seven worth believing. It is also
     * simply true, which is the only defensible reason to print anything here.
     */
    job: 'Buzz your phone when it is time',
    others: ['yes', 'yes', 'yes', 'yes'],
    todonado: 'no',
    note: 'In-app only for now',
  },
  {
    job: 'Do all of it in one place',
    others: ['no', 'no', 'no', 'no'],
    todonado: 'yes',
  },
] as const

const VERDICT_LABEL: Record<Verdict, string> = {
  yes: 'Yes',
  partial: 'Partly',
  no: 'Usually separate',
}

/*
 * "Usually separate" is a statement about how the OTHER categories are used: you
 * run a timer alongside a task app. Said of Todonado's own column it would be
 * meaningless, and on the one row we lose it would read as evasion. Our own "no"
 * says no.
 */
const TODONADO_NO_LABEL = 'Not built yet'

function VerdictMark({
  verdict,
  strong = false,
}: {
  verdict: Verdict
  strong?: boolean
}) {
  const label = verdict === 'no' && strong ? TODONADO_NO_LABEL : VERDICT_LABEL[verdict]
  if (verdict === 'yes') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Check
          className={cn('h-4 w-4', strong ? 'text-brand' : 'text-success')}
          aria-hidden
        />
        <span className="sr-only">{label}</span>
      </span>
    )
  }
  if (verdict === 'partial') {
    return (
      <span className="inline-flex items-center gap-1.5 text-warning">
        <Minus className="h-4 w-4" aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-text-muted/60">
      <X className="h-4 w-4" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/**
 * The key.
 *
 * Without it a reader sees three unexplained glyphs and has to guess whether a
 * dash means "no" or "unknown". The screen-reader text on every mark already
 * said what it meant; sighted readers were the ones left guessing.
 */
function Legend() {
  return (
    <ul className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-text-muted">
      <li className="flex items-center gap-1.5">
        <Check className="h-3.5 w-3.5 text-success" aria-hidden /> Yes
      </li>
      <li className="flex items-center gap-1.5">
        <Minus className="h-3.5 w-3.5 text-warning" aria-hidden /> Partly
      </li>
      <li className="flex items-center gap-1.5">
        <X className="h-3.5 w-3.5 text-text-muted/60" aria-hidden /> Usually a separate tool
      </li>
    </ul>
  )
}

export function CategoryComparison({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Legend />
      {/* ── Desktop ───────────────────────────────────────────────────── */}
      <table className="hidden w-full border-collapse text-left text-sm lg:table">
        <caption className="sr-only">
          How Todonado compares with the categories of tool people already use
        </caption>
        <thead>
          <tr className="border-b border-white/10">
            <th scope="col" className="w-[30%] py-3 pr-4 font-medium text-text-muted">
              What you are trying to do
            </th>
            {CATEGORIES.map((category) => (
              <th
                key={category}
                scope="col"
                className="px-3 py-3 text-center font-medium text-text-muted"
              >
                {category}
              </th>
            ))}
            {/*
              Bold, not tinted. The pricing table 900px below uses a violet
              column to mark Pro, and when this one did too the two read as a
              single spreadsheet spanning the seam between the sections. The
              header carries the emphasis here instead.
            */}
            <th
              scope="col"
              className="rounded-t-xl border-b-2 border-brand px-3 py-3 text-center font-semibold text-text-primary"
            >
              Todonado
            </th>
          </tr>
        </thead>
        <tbody>
          {JOB_ROWS.map((row) => (
            <tr key={row.job} className="border-b border-white/5">
              <th scope="row" className="py-3.5 pr-4 font-normal text-text-primary">
                {row.job}
              </th>
              {row.others.map((verdict, index) => (
                <td key={index} className="px-3 py-3.5 text-center">
                  <span className="inline-flex justify-center">
                    <VerdictMark verdict={verdict} />
                  </span>
                </td>
              ))}
              <td className="px-3 py-3.5 text-center">
                <span className="inline-flex flex-col items-center gap-0.5">
                  <VerdictMark verdict={row.todonado} strong />
                  {row.proNote && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-brand">
                      Pro
                    </span>
                  )}
                  {row.note && (
                    <span className="text-[10px] leading-tight text-text-muted">{row.note}</span>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Mobile / tablet: one card per job ─────────────────────────── */}
      <ul className="space-y-2 lg:hidden">
        {JOB_ROWS.map((row) => (
          <li key={row.job} className="rounded-xl border border-white/8 bg-surface-2/40 p-3">
            <p className="text-sm font-semibold text-text-primary">{row.job}</p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {row.others.map((verdict, index) => (
                <div key={index} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs text-text-muted">
                    {CATEGORIES[index]}
                  </span>
                  <span className="shrink-0 text-xs text-text-muted">
                    {VERDICT_LABEL[verdict]}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-brand/10 px-3 py-1">
              <span className="text-xs font-semibold text-text-primary">Todonado</span>
              <span className="flex items-center gap-2 text-xs font-medium text-text-primary">
                {row.todonado === 'no' ? TODONADO_NO_LABEL : VERDICT_LABEL[row.todonado]}
                {row.proNote && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-brand">
                    Pro
                  </span>
                )}
                {row.note && <span className="text-[10px] text-text-muted">{row.note}</span>}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-5 max-w-2xl text-xs leading-relaxed text-text-muted">
        These are categories of tool, not particular products, and each column describes what that
        kind of tool is built for rather than what its best example can be configured to do. Two
        rows are marked Pro because those parts of Todonado are paid, and one row is a loss:
        reminders that reach you when the app is closed are not built yet. Compared August 2026.
      </p>
    </div>
  )
}
