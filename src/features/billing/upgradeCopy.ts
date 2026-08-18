import type { Feature, LimitKey } from './entitlements'

/**
 * ONE VOCABULARY FOR EVERY PAID GATE IN THE APP.
 *
 * ── WHY THIS IS A REGISTRY AND NOT PROSE IN COMPONENTS ─────────────────────
 *
 * Before this file the app asked for money in six different voices. A survey of
 * the components turned up "Upgrade" fourteen times, "Unlock" three times,
 * "Upgrade to Pro" twice, "part of Pro" three times and "See the plans" once,
 * across five bespoke limit cards, two full-page teasers and two inline
 * paragraphs. Each was individually fine and together they read as several
 * products, which is exactly the impression a paid tier cannot afford.
 *
 * ── THE SHAPE, AND WHY IT IS THIS SHAPE ────────────────────────────────────
 *
 *   title  what the capability IS, in the user's terms
 *   why    why it matters, concretely, in one sentence
 *   cta    the action. Always the same two words everywhere in the product.
 *
 * `reassurance` is optional and carries the sentence that stops a limit reading
 * as a threat: nothing you made is affected. It exists because the count limits
 * gate CREATION only, and a user who has hit one needs to be told, at that exact
 * moment, that the things they already made are safe. Leaving that to be
 * remembered per component is how it ends up on four cards out of five.
 *
 * ── RULES FOR ANYTHING ADDED HERE ──────────────────────────────────────────
 *
 * 1. Describe the capability, never the plan. "Plan your whole week" beats
 *    "Get Pro", because the second one is about our billing and the first is
 *    about their day.
 * 2. No urgency, no scarcity, no countdowns, no "limited time". None of it is
 *    true, and a planner that pressures you is a contradiction in terms.
 * 3. Never imply anything is lost or deleted. Nothing ever is, on any plan.
 * 4. The CTA string is `UPGRADE_CTA` and nothing else. If a surface needs
 *    different words, the surface is wrong, not the constant.
 */

/** Every gate that can ask for money. A capability or a ceiling. */
export type UpgradeKey = Feature | LimitKey

export interface UpgradeCopy {
  /** What it is. Sentence case, no trailing full stop. */
  title: string
  /** Why it matters. One sentence, ending in a full stop. */
  why: string
  /** Only for count limits: the sentence that says nothing is at risk. */
  reassurance?: string
}

/**
 * The single call to action, everywhere.
 *
 * "See what Pro adds" rather than "Upgrade" on purpose: it describes what the
 * link does, which is show a page, not take money. A CTA that overstates the
 * commitment gets fewer clicks from people who would have converted and more
 * from people who feel tricked when they land on a pricing page.
 */
export const UPGRADE_CTA = 'See what Pro adds'

/** Where a user is sent. One route, so no surface can invent its own. */
export const UPGRADE_ROUTE = '/settings/plan'

export const UPGRADE_COPY: Record<UpgradeKey, UpgradeCopy> = {
  /* ── Capabilities ─────────────────────────────────────────────────────── */
  'week.board': {
    title: 'Plan your whole week',
    why: 'Seven days side by side, each with its own capacity, so you can move work to the day that actually has room for it.',
  },
  'week.autoPlan': {
    title: 'Fill the week in one tap',
    why: 'Spreads what you have across the next seven days without overloading any single one.',
  },
  'insights.dashboard': {
    title: 'See where your time really goes',
    why: 'What you planned against what actually happened, and whether your focus is getting better or worse.',
  },
  'insights.estimateAccuracy': {
    title: 'Find out how far off your estimates run',
    why: 'Once you have finished enough work, this tells you whether your thirty minutes is really fifty.',
  },
  'insights.weeklyReview': {
    title: 'Look back on the week',
    why: 'This week against last, so a good run or a bad one is something you can see rather than guess at.',
  },
  'insights.pointsBreakdown': {
    title: 'See where your score came from',
    why: 'The audit trail behind the number on Today, broken down by what earned it.',
  },
  'history.unlimited': {
    title: 'Keep your full history in view',
    why: 'Everything you have finished stays visible, so you can look back further than the last month.',
    reassurance: 'Nothing is ever deleted on either plan. Free shows a rolling window; Pro shows all of it.',
  },
  'calendar.liveSync': {
    title: 'Keep your calendar and your plan in step',
    why: 'Paste a calendar link once and your meetings keep taking up real room in your day, even when they move.',
    reassurance: 'Importing a calendar file works on every plan.',
  },
  'journal.voiceNotes': {
    title: 'Say it instead of typing it',
    why: 'Record a voice note on the days when writing is the thing standing in the way.',
    reassurance: 'The written journal is free, and any note you have already recorded stays here and stays playable.',
  },
  'digest.preplannedDay': {
    title: 'Start with the day already planned',
    why: 'Your briefing arrives with a suggested day ready to accept, instead of a button to build one.',
  },

  /* ── Ceilings ─────────────────────────────────────────────────────────── */
  historyDays: {
    title: 'Keep your full history in view',
    why: 'Everything you have finished stays visible, so you can look back further than the last month.',
    reassurance: 'Nothing is ever deleted. This only changes how far back the list goes.',
  },
  personalTemplates: {
    title: 'Save as many templates as you like',
    why: 'Every routine you repeat, captured once and applied in a tap.',
    reassurance: 'The templates you have saved keep working exactly as they are. This only limits making new ones.',
  },
  visionCards: {
    title: 'Keep every goal in front of you',
    why: 'The reasons behind the work, all in one place rather than the three that fit.',
    reassurance: 'The goals you have written stay exactly where they are. This only limits adding more.',
  },
  mindMaps: {
    title: 'Think on as many canvases as you need',
    why: 'A map per idea, for the stage where a thought is still branching.',
    reassurance: 'Every map you have made stays open and editable. This only limits creating new ones.',
  },
  quitHabits: {
    title: 'Track everything you are giving up',
    why: 'More than one habit at a time, each with its own clean streak.',
    reassurance: 'Your streaks keep running and nothing resets. This only limits adding another habit.',
  },
  activeChallenges: {
    title: 'Take on more than one at a time',
    why: 'Run several challenges together instead of finishing one before starting the next.',
    reassurance: 'The challenge you are in carries on exactly as it is.',
  },
  /*
   * Present so the record is exhaustive, and deliberately NOT an upsell.
   *
   * The calendar-source ceiling is identical on both plans because it is an
   * abuse limit enforced by a database trigger, not a price lever. If this copy
   * ever gets rendered, something has confused a security cap for a commercial
   * one, and the wording says so rather than trying to sell a way past it.
   */
  calendarSources: {
    title: 'Calendar sources',
    why: 'There is a ceiling on how many calendars one account can pull, and it is the same on every plan.',
    reassurance: 'This is not a paid limit and upgrading does not raise it.',
  },
}
