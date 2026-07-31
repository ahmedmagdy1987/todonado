/** App-wide configuration & feature flags. */

/**
 * Support / legal contact shown on the Privacy and Terms pages (and anywhere
 * else the product needs a human contact address). Single source of truth —
 * change it here and it updates everywhere.
 */
export const LEGAL_CONTACT = 'support@todonado.com'

/** Default daily planning capacity (minutes) when a profile has none. */
export const DEFAULT_DAILY_CAPACITY_MINUTES = 360

/**
 * How many CALENDAR DAYS of completed history a Free plan can see, counting
 * today. Pro (and Founding) are unlimited. Tunable — this is the only place the
 * number lives.
 *
 * This is a VIEW limit, never a data limit: nothing is deleted, archived, or
 * mutated, and upgrading reveals everything instantly. It applies ONLY to
 * completed/history surfaces — open tasks, Today, Inbox, roll-over, capacity,
 * auto-plan and templates are fully functional on Free no matter how old the
 * task is. See src/features/history/historyWindow.ts.
 */
export const FREE_HISTORY_DAYS = 14

/**
 * How many PERSONAL templates a Free plan may CREATE. Pro (and Founding) are
 * unlimited. Tunable — this is the only place the number lives.
 *
 * The limit gates creation ONLY. Templates already saved keep working and
 * applying forever at any count: nothing a user made is ever held hostage.
 */
export const FREE_PERSONAL_TEMPLATES = 3

/**
 * How many ACTIVE quit habits a Free plan may CREATE. Pro (and Founding) are
 * unlimited. Tunable — this is the only place the number lives.
 *
 * Same principle as FREE_PERSONAL_TEMPLATES: the limit gates CREATION only.
 * A habit already being tracked keeps counting, checking in and celebrating
 * milestones forever, at any count. Interrupting someone's clean streak to sell
 * them something would be indefensible, and this is the one feature in the app
 * where that would do real harm.
 */
export const FREE_QUIT_HABITS = 1

/**
 * How many VISION cards a Free plan may CREATE. Pro (and Founding) are
 * unlimited. Tunable — this is the only place the number lives.
 *
 * Same principle as FREE_PERSONAL_TEMPLATES and FREE_QUIT_HABITS: the limit
 * gates CREATION only. Every goal already written stays visible, editable and
 * linkable forever. Holding someone's goals hostage would be a grim way to sell
 * a subscription.
 */
export const FREE_VISION_CARDS = 3

/**
 * How many MIND MAPS a Free plan may CREATE. Pro (and Founding) are unlimited.
 * Tunable — this is the only place the number lives.
 *
 * Same principle as every other cap here: it gates CREATION only. A map already
 * drawn opens, edits and saves forever, at any count. One is deliberately enough
 * to be useful rather than a demo — a single map holds 200 nodes.
 */
export const FREE_MIND_MAPS = 1

/**
 * How many challenges a Free plan may have ACTIVE at once. Pro is unlimited.
 *
 * Unlike the other caps this one is about attention rather than storage: a
 * person running six challenges at once is not doing any of them. Completed and
 * abandoned challenges never count against it, and it never blocks restarting.
 */
export const FREE_ACTIVE_CHALLENGES = 1

/**
 * How many days the points score covers. Deliberately the same as
 * `INSIGHTS_SUMMARY_DAYS`, so the chip on Today and the breakdown in Insights
 * describe exactly the same window and cannot disagree.
 */
export const POINTS_WINDOW_DAYS = 7

/**
 * The ONLY place point values live. Every score in the app is derived from
 * these — there is no stored total anywhere.
 *
 * `maxEffortPointsPerTask` is the one deliberately opinionated number: without
 * it, a single task estimated at eight hours would outweigh a whole week of
 * real work, and anyone who noticed could inflate their score by typing a bigger
 * estimate. Capping it makes the number harder to game, not easier.
 */
export const POINT_WEIGHTS = {
  perCompletedTask: 10,
  /** Effort is rewarded, but gently and with a ceiling. */
  perHalfHourOfEffort: 5,
  maxEffortPointsPerTask: 30,
  perFocusSession: 15,
  perTenFocusMinutes: 4,
} as const

/**
 * Supabase realtime sync for the active workspace. Safe to disable if it ever
 * causes instability — the app remains fully functional via TanStack Query.
 */
export const ENABLE_REALTIME = true

/**
 * Feature flags for gated / optional surfaces. Flip a flag off to fully remove
 * that surface (nav entry + routes + hub) with NO impact on the core app
 * (Today/Inbox/Projects/Focus/Insights). Each flag is self-contained and
 * reversible by design.
 */
export const FEATURES = {
  /**
   * The "Focus & Calm" wellness suite (breathwork, sleep sounds, guided
   * meditation, supplement/medication tracker). Default ON for signed-in users;
   * set to false to hide the entire in-app suite without touching the core.
   */
  wellness: true,
  /**
   * "Start from a template" — a catalog of ready-made, effort-tagged task lists
   * users can apply in one click. Content-only (no DB); free, to drive
   * activation. Default ON; set to false to hide the Templates nav item, the
   * /templates routes, and the empty-state CTAs without touching the core.
   */
  templates: true,
  /**
   * Auto-effort estimation — when a task has no effort yet, suggest an
   * `effort_minutes` value (from the user's own history of similar tasks, else a
   * transparent keyword heuristic) as a one-tap chip. Always a visible SUGGESTION
   * the user accepts/overrides; never sets effort silently. Default ON; set to
   * false to hide the suggestion chip everywhere (no other behavior changes).
   */
  autoEffort: true,
  /**
   * Auto-plan-my-day — a "Plan my day" button on Today that deterministically
   * fills today within the REMAINING capacity (priority → due → effort, greedy,
   * never over) and schedules the chosen tasks, behind a preview/confirm. Pure +
   * unit-tested; no AI. Default ON; set to false to hide the button (Today's
   * existing capacity/roll-over behavior is untouched either way).
   */
  autoPlan: true,
  /**
   * Calendar busy-import (ICS) — let a user add an .ics calendar (file upload =
   * reliable; URL subscribe = best-effort, often CORS-blocked) in Settings, so
   * today's timed meetings subtract from available capacity alongside task effort.
   * Pure parser + capacity math, unit-tested; a calendar failure NEVER breaks the
   * meter (falls back to task-only capacity). Default ON; set to false to hide the
   * Settings section and ignore all calendar sources (capacity = tasks only).
   */
  calendarImport: true,
  /**
   * Planning streak — a subtle, NON-shaming flame badge in the Today header
   * counting consecutive local days the user planned/showed up. Derived purely
   * from the tasks already in cache (no new table); a missed day is never
   * guilt-tripped (the badge simply doesn't show at 0). Default ON; set to false
   * to hide the badge (no other behavior changes).
   */
  streak: true,
  /**
   * "Start your day" — a dismissible briefing card at the top of Today that
   * sums up carried-over work, meetings and free capacity, and offers the
   * existing one-tap plan. Composed entirely from queries Today already runs
   * (no new fetches); Pro additionally gets a pre-computed plan, an estimation
   * nudge and priority alerts. Default ON; set to false to remove the card
   * everywhere with no other behaviour change.
   */
  digest: true,
  /**
   * Week planning — a /week view of the next 7 days, each with its own capacity
   * meter (calendar-aware), tasks draggable between days, and a deterministic
   * "Plan my week". PRO surface (resolved via usePlan); Free sees a clearly
   * labelled sample-data preview. Default ON; set to false to remove the route,
   * the nav entry and the Today toggle with no other behaviour change.
   */
  week: true,
  /**
   * Quit tracker — a "Quit" area inside Wellness for habits the user is
   * BREAKING: day zero, a live clean-streak counter, a no-shame "I slipped"
   * reset that keeps the longest-streak record, optional daily check-ins,
   * milestones, and a "do this instead" replacement action. Owner-only data in
   * `quit_habits` / `quit_checkins`. Default ON; set to false to remove the
   * route and the hub card with no other behaviour change.
   */
  quitTracker: true,
  /**
   * Pomodoro mode inside Focus — the classic 25/5 cadence with a 15-minute long
   * break after every 4th interval. A chain is one `focus_sessions` row per work
   * interval (so break time is never counted as focus time, and no migration is
   * needed); the break itself is device-local UI state, derived from a timestamp
   * exactly like the timer. Default ON; set to false to hide the mode toggle and
   * the break screen — the existing 25/50/90 + custom sprint is untouched either
   * way, and an in-progress chain simply behaves as a normal sprint.
   */
  pomodoro: true,
  /**
   * "Get to Work" — a one-tap route (/work) that picks the top thing to do,
   * offers a 60-second breathwork reset first, and hands off to the existing
   * Focus timer. Composition only: it starts no timer of its own and owns no
   * data. Default ON; set to false to remove the route and the Today button with
   * no other behaviour change. (The breathwork pre-step is additionally gated by
   * FEATURES.wellness, so switching the wellness suite off still removes it.)
   */
  getToWork: true,
  /**
   * Vision — a /vision page of goal cards (title + why + optional target date),
   * reorderable, each optionally linked to the project that serves it. TEXT-FIRST
   * on purpose: no image uploads, because images mean a storage bucket, upload
   * limits, a storage policy and a bill, and the honest way to decide that is to
   * measure demand first (the 'vision_images' fake door). Owner-only data in
   * `vision_cards`. Default ON; set to false to remove the route and the nav
   * entry with no other behaviour change.
   */
  vision: true,
  /**
   * Points — a subtle, derived score for the last POINTS_WINDOW_DAYS days,
   * shown as a chip on Today and broken down in Insights. No table, no column,
   * no stored counter: recomputed from the tasks and focus sessions already in
   * cache, exactly like the streak. No leaderboards, no decay, no penalties, and
   * the chip simply doesn't render at zero. Default ON; set to false to hide the
   * chip and the Insights panel (no other behaviour changes).
   */
  points: true,
  /**
   * Share cards — a "Share" action on the streak chip and on quit-habit
   * milestones that draws a branded PNG in-browser (canvas, no upload, no
   * server) and hands it to the native share sheet, falling back to copy or
   * download. The card carries the NUMBER and an optional first name, nothing
   * else. Default ON; set to false to remove every share affordance.
   */
  shareCards: true,
  /**
   * The Hub — a /hub grid of every destination, for the moment you know you want
   * to DO something but not which part of the app does it. ADDITIVE: Today
   * remains the default screen after login, every destination stays reachable
   * the way it always was, and switching your start screen to the Hub is a
   * preference in Settings rather than something the app decides. Default ON;
   * set to false to remove the route, the nav entry and the Settings toggle.
   */
  hub: true,
  /**
   * Mind maps — a canvas of draggable ideas connected by lines, at
   * /vision/maps. The stage BEFORE a task list: branching thoughts you cannot
   * yet order, where a node may optionally say "this idea is that project" and
   * link into the real work. Hand-rolled SVG, no graph library. Owner-only data
   * in `mind_maps` (one row per map, graph in jsonb). Default ON; set to false
   * to remove the routes, the Vision link and the hub tile with no other
   * behaviour change.
   */
  mindMaps: true,
  /**
   * Challenges — structured multi-day pushes (/challenges) the user opts into.
   * Progress is DERIVED from data the app already has (tasks, focus sessions,
   * quit check-ins, journal entries), exactly like the streak and points: no new
   * tracking machinery, no daily job, and nothing to drift. Owner-only data in
   * `user_challenges` (which records only that you joined, never your progress).
   * Default ON; set to false to remove the route, the nav entry and the hub tile.
   */
  challenges: true,
  /**
   * Daily journal — /journal, a prompt-guided entry per day plus optional voice
   * notes (Pro). Owner-only data in `journal_entries`, audio in the private
   * `journal-audio` storage bucket behind signed URLs.
   *
   * NO AI, PERMANENTLY (see CLAUDE.md §5). The reading-back-and-spotting-patterns
   * layer is cancelled rather than pending, so the page no longer mentions it at
   * all: it is a place to write, and that is the whole feature. Default ON; set
   * to false to remove the route, the nav entry and the hub tile.
   */
  journal: true,
} as const
