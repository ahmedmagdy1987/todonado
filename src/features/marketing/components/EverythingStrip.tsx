import {
  CalendarClock,
  Flag,
  LayoutList,
  Network,
  NotebookPen,
  Repeat,
  type LucideIcon,
} from 'lucide-react'
import { Reveal } from '../demo/Reveal'

interface Item {
  icon: LucideIcon
  label: string
  /** Three or four words. No sentences — the icons carry the rest. */
  blurb: string
}

/**
 * EVERYTHING HERE SHIPS TODAY. Nothing aspirational in this strip.
 *
 * That rule is load-bearing, and it is why the Quit tracker and Vision were held
 * back from this list until 2026-07-30 even though the code had shipped: their
 * tables were committed-but-unapplied migrations, so a visitor who signed up
 * would have found an honest "not switched on yet" page instead of the feature
 * the landing page promised. `20260730120000_quit_habits.sql` and
 * `20260730140000_vision_cards.sql` are now applied and live-verified (tables
 * present, anon reads `[]`, anon writes `42501`), so both are claimable.
 *
 * Anything added here in future must clear the same bar: not "the code is
 * merged" but "a stranger who signs up right now can use it".
 */
/**
 * ── THE SECOND RULE, ADDED IN THE EXECUTIVE CUT ────────────────────────────
 *
 * NOTHING HERE MAY REPEAT SOMETHING THE GROUP CARDS ABOVE ALREADY NAME.
 *
 * This list used to carry fourteen items, and once it moved inside the breadth
 * section TEN of them turned out to be duplicates of a bullet a few hundred
 * pixels higher up: "Get to work" was in the Focus group, "Quit tracker" in
 * Habits, "Insights" in Reflect, "Focus & pomodoro" restated the Pomodoro
 * bullet, and so on. Separated by a section boundary that was merely wasteful;
 * adjacent, it reads as padding, which is precisely what a breadth section
 * cannot afford to look like.
 *
 * So the list is now exactly the shipped capabilities the five groups do NOT
 * mention. Two of them (recurring tasks, and the project structure itself) were
 * missing from BOTH lists, which the deduplication is what surfaced.
 *
 * Adding an item here means first checking it is not already named above.
 */
const ITEMS: Item[] = [
  { icon: Repeat, label: 'Recurring tasks', blurb: 'Daily, weekly, monthly, yearly' },
  { icon: LayoutList, label: 'Projects & subtasks', blurb: 'Sections, priorities, drag to reorder' },
  { icon: CalendarClock, label: 'Calendar', blurb: 'Meetings take time off your day' },
  // These three waited out of the list entirely while their migrations were
  // pending, for the reason at the top of this file: a visitor who signed up
  // would have found an honest "not switched on yet" page instead of the
  // feature the strip promised. `20260731120000_mind_maps`,
  // `20260731130000_user_challenges` and `20260731140000_journal_entries` are
  // applied and live-verified, so all three are claimable.
  { icon: Network, label: 'Mind maps', blurb: 'Think it out first' },
  { icon: NotebookPen, label: 'Journal', blurb: 'How today went' },
  { icon: Flag, label: 'Challenges', blurb: 'Try something for seven days' },
]

/**
 * NO LONGER ITS OWN SECTION.
 *
 * This shipped as a standalone band directly after "One place for your day",
 * which meant the page made a breadth argument twice in a row: once grouped by
 * the job each surface does, and then again as a flat list of everything. The
 * second one is the weaker of the two and it is the one that reads as "look,
 * we also built this" rather than "this completes your system".
 *
 * So it renders INSIDE the breadth section now, as its tail. Same items, same
 * rule (see the header above: everything here ships today), one fewer section,
 * and the grouped framing is what the reader is left holding.
 *
 * It keeps a heading, so it is still a findable, testable landmark rather than
 * an anonymous list glued to the bottom of something else.
 */
export function EverythingStrip() {
  return (
    <div className="mx-auto mt-14 max-w-4xl border-t border-white/5 pt-10">
      <Reveal className="text-center">
        <h3 id="everything" className="font-display text-lg font-semibold sm:text-xl">
          Everything else you&rsquo;d expect
        </h3>
        <p className="mt-2 text-sm text-text-muted">
          All of it included, on every plan unless a line says otherwise.
        </p>
      </Reveal>

      {/*
        A DENSE LIST, NOT FOURTEEN CARDS.

        This was fourteen bordered cards in a grid, immediately after two other
        card grids, and the run of them read as filler no matter how true each
        line was. Stripping the chrome to a hairline-ruled list removes roughly
        a screen of height and lets it do the only job it has: completeness.
      */}
      <ul className="mt-8 grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {ITEMS.map(({ icon: Icon, label, blurb }, i) => (
          <li key={label} className="border-b border-white/5">
            <Reveal delay={Math.min(i, 8) * 40}>
              <div className="flex items-center gap-3 py-3">
                <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                <p className="shrink-0 text-sm font-medium text-text-primary">{label}</p>
                <p className="min-w-0 flex-1 truncate text-right text-xs text-text-muted">
                  {blurb}
                </p>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
    </div>
  )
}
