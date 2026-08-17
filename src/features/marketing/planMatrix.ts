import {
  FREE_ACTIVE_CHALLENGES,
  FREE_HISTORY_DAYS,
  FREE_MIND_MAPS,
  FREE_PERSONAL_TEMPLATES,
  FREE_QUIT_HABITS,
  FREE_VISION_CARDS,
} from '@/lib/config'

/**
 * FREE VS PRO, AS THE CODE ACTUALLY BEHAVES TODAY.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM plans.ts ───────────────────────────────
 *
 * `plans.ts` holds two SELLING lists: what Free includes, what Pro adds. Those
 * are the right shape for a pricing card and the wrong shape for the question
 * a visitor actually asks, which is comparative: "if I don't pay, what don't I
 * get?" Answering that from two separate bullet lists means holding both in
 * your head and diffing them. This is the same truth as one row per capability.
 *
 * ── THE STANDARD EVERY ROW HERE IS HELD TO ─────────────────────────────────
 *
 * A row may only claim a difference that a `usePlan()` gate or a `FREE_*`
 * constant actually produces. A full product + entitlement audit on 2026-08-17
 * read all 146 shipped capabilities and found exactly twelve Pro surfaces; they
 * are the twelve below and nothing else. See docs/PRODUCT_VALUE_AUDIT.md.
 *
 * That audit also found three claims in the live copy that this table
 * deliberately corrects, because they were the two most damaging kinds of
 * marketing error: promising something that is already free, and implying a
 * penalty that does not exist.
 *
 *   1. "Unlimited history: every completed task, kept forever" implied Free
 *      DELETES data. It does not, and never has. `FREE_HISTORY_DAYS` is a view
 *      filter over rows already sitting in the user's own browser cache, so
 *      upgrading reveals them on the next render with no refetch. The row below
 *      says "window", says nothing is deleted, and is the honest version of a
 *      genuinely paid feature.
 *   2. "Everything in Free, unlimited" mapped to no gate anywhere in the code.
 *      It is gone rather than rephrased.
 *   3. The Free history bullet never disclosed that the PLANNING STREAK passes
 *      through the same window, so a Free user who has planned every day for
 *      three months still reads "14-day streak". The row below states it.
 *      (Fixing the streak itself is a product change and is proposed, not made,
 *      in the audit under E4.)
 *
 * The caps are TEMPLATED from `@/lib/config`, never typed as literals, so a
 * changed constant cannot leave a stale number on the public page.
 *
 * ── THIS TABLE DESCRIBES TODAY, NOT THE PROPOSAL ───────────────────────────
 *
 * The audit recommends a different ladder (30-day history, higher caps, an
 * uncapped streak). NONE of that is implemented and none of it may appear here.
 * Advertising a proposed restriction, or a proposed generosity, as live is the
 * one thing a pricing table must never do.
 */

/** What a plan gives for one capability. */
export interface PlanCell {
  /** Short enough to scan in a table cell. */
  label: string
  /** How the cell reads: a tick, a limit, or absent. */
  kind: 'yes' | 'limited' | 'no'
}

export interface PlanRow {
  capability: string
  /** One clause on why it matters. Shown under the name on mobile. */
  note?: string
  free: PlanCell
  pro: PlanCell
  /** Rows that carry the paid argument, highlighted in the table. */
  decisive?: boolean
}

export interface PlanGroup {
  name: string
  rows: PlanRow[]
}

const yes = (label = 'Included'): PlanCell => ({ label, kind: 'yes' })
const no = (label = 'Not included'): PlanCell => ({ label, kind: 'no' })
const limited = (label: string): PlanCell => ({ label, kind: 'limited' })

export const PLAN_MATRIX: PlanGroup[] = [
  {
    name: 'Plan the day',
    rows: [
      {
        capability: 'Tasks, projects, sections and subtasks',
        note: 'No limit on either plan. Capture is never what you pay for.',
        free: yes('Unlimited'),
        pro: yes('Unlimited'),
      },
      {
        capability: 'Capacity meter and overbooking warning',
        note: 'The thing that makes this different, and it is free.',
        free: yes(),
        pro: yes(),
      },
      {
        capability: '“Plan my day”, roll-over with undo, recurring tasks, templates',
        free: yes(),
        pro: yes(),
      },
      {
        capability: 'Daily briefing',
        note: 'Free gets the briefing. Pro gets the day already planned inside it.',
        free: limited('The briefing'),
        pro: yes('Planned, with nudges'),
      },
    ],
  },
  {
    name: 'Plan the week',
    rows: [
      {
        capability: 'Week board: seven days, capacity per day, drag work between them',
        note: 'The main reason to upgrade.',
        free: limited('Sample week'),
        pro: yes(),
        decisive: true,
      },
      {
        capability: '“Plan my week”: fill seven days without overloading one',
        free: no(),
        pro: yes(),
        decisive: true,
      },
    ],
  },
  {
    name: 'Focus and execute',
    rows: [
      {
        capability: 'Focus mode, Pomodoro, interruptions, “Get to work”, and the real time each task took',
        note: 'All of it, free, forever. Focus is the daily habit, and the timings it produces are what everything else learns from.',
        free: yes(),
        pro: yes(),
      },
    ],
  },
  {
    name: 'Learn from it',
    rows: [
      {
        capability: 'Insights: planned time vs real time, capacity and focus trends',
        free: no(),
        pro: yes(),
        decisive: true,
      },
      {
        capability: 'Estimate accuracy',
        note: 'Needs a handful of finished tasks before it can tell you anything.',
        free: no(),
        pro: yes(),
        decisive: true,
      },
      {
        capability: 'Completed history and your planning streak',
        note: `Nothing is ever deleted on either plan. Free shows a rolling window of the last ${FREE_HISTORY_DAYS} days, and the streak counts inside it.`,
        free: limited(`Last ${FREE_HISTORY_DAYS} days`),
        pro: yes('All of it'),
        decisive: true,
      },
    ],
  },
  {
    name: 'Connect your calendar',
    rows: [
      {
        capability: 'Import a calendar file, so meetings take up real room',
        free: yes('.ics file'),
        pro: yes('.ics file'),
      },
      {
        capability: 'Live calendar link that refreshes itself',
        note: 'Paste the link once. Moved meetings show up on their own.',
        free: no(),
        pro: yes(),
        decisive: true,
      },
    ],
  },
  {
    name: 'Reflect and keep going',
    rows: [
      {
        capability: 'Daily journal',
        note: 'Text on both plans. Pro can also record a voice note.',
        free: yes('Text'),
        pro: yes('Text and voice'),
      },
      {
        capability: 'Your own templates',
        free: limited(`${FREE_PERSONAL_TEMPLATES} of them`),
        pro: yes('Unlimited'),
      },
      {
        capability: 'Vision goals, mind maps, quit habits, challenges',
        note: 'Free lets you keep a few of each. Nothing you have made is ever taken away.',
        free: limited(
          `${FREE_VISION_CARDS} goals · ${FREE_MIND_MAPS} map · ${FREE_QUIT_HABITS} habit · ${FREE_ACTIVE_CHALLENGES} challenge`,
        ),
        pro: yes('Unlimited'),
      },
      {
        capability: 'Breathwork, sleep noise and the supplement log',
        note: 'Free, on purpose. Winding down is not something to charge for.',
        free: yes(),
        pro: yes(),
      },
    ],
  },
]

/**
 * The short answer, for the section above the table.
 *
 * Deliberately THREE, and deliberately the three the audit verified as the real
 * reasons to pay: the week board, the retrospective, and the live calendar. The
 * count caps are real but they are not a reason anyone upgrades on day one, and
 * leading with them would make Pro sound like a set of raised numbers.
 */
export const WHY_PRO = [
  {
    title: 'See the whole week, not just today',
    body: 'Seven days side by side, each with its own capacity. Drag work between them, or let “Plan my week” spread it out so no single day is overloaded.',
  },
  {
    title: 'Find out where the time really goes',
    body: 'What you planned against what actually happened, how far off your estimates run, and whether your focus is improving. It is your own data, read back to you.',
  },
  {
    title: 'Keep your calendar and your plan in step',
    body: 'Paste your calendar link once. Meetings keep taking up real room in your day, and when one moves, your capacity moves with it.',
  },
] as const
