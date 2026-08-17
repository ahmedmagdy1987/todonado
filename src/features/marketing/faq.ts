/**
 * THE PUBLIC FAQ, IN ONE PLACE.
 *
 * It used to live entirely inside `LandingFaq`, and a previous compression pass
 * pushed back on cutting it with a fair argument: two of the five answers exist
 * nowhere else on the public site, so removing them from the homepage would
 * DELETE information rather than compress it.
 *
 * That premise was true and is now false, which is what makes the cut safe. The
 * full set lives on `/pricing`, where somebody weighing the decision is already
 * looking; the homepage carries only the three a visitor asks BEFORE they are
 * willing to look at a price, and links to the rest.
 *
 * HONEST ANSWERS ONLY — every claim reflects what the app does today.
 */

export interface Qa {
  q: string
  a: string
}

export const FAQ: Qa[] = [
  {
    q: 'Is Todonado free?',
    a: 'Most of it, permanently. The capacity meter and its overbooking warning, “Plan my day”, unfinished work rolling to tomorrow, focus mode with Pomodoro, repeating tasks, the templates and checklists, breathwork and the quit tracker are all free. That is a complete day, not a trial. Pro adds the week ahead and a look back at how your days really went, and you can upgrade anytime from your plan settings.',
  },
  {
    q: 'What do I get with Pro?',
    a: 'The week ahead, and a look back at how your days really went. Week planning shows seven days at once, each with its own capacity, plus a one-tap “Plan my week”. Insights compare the time you planned with the time you actually spent, and show how accurate your estimates are getting. Pro also keeps your finished tasks forever instead of the last 14 days, keeps a linked calendar up to date so your meetings always show, and gives you a morning briefing with the day already planned.',
  },
  {
    q: 'Can I cancel?',
    a: 'Any time, from your plan settings, in a couple of clicks. You keep Pro until the end of the period you already paid for, and then the account simply becomes a free one. Nothing is deleted and nothing is locked. Your finished tasks past the free 14-day window are hidden rather than removed, so upgrading again brings them straight back.',
  },
  {
    q: 'What isn’t built yet?',
    a: 'Two things, and both are on their way. Recorded nature sounds and guided meditation: rain, thunder, ocean and the spoken sessions all need audio we have not licensed yet. Referral discount codes: billing has to go live first, and until then the share link already works. Sleep sounds itself works now, because white, pink and brown noise are generated on your device rather than downloaded. Everything else on this page you can use right now.',
  },
  {
    q: 'Does it work on my phone?',
    a: 'Yes. Todonado runs in your browser, and you can add it to your home screen so it opens like any other app. There is nothing to download from an app store. Plan on your laptop, work from your phone. Same account either way.',
  },
  {
    q: 'Is my data private?',
    a: 'Your tasks are yours. Your data is locked to your account inside the database, so no one else can read it. You can export everything, or permanently delete your account and its data, from Settings at any time.',
  },
]

/**
 * The three a visitor asks before they will look at a price: does this cost me
 * anything, what does paying buy, and can I get out. Everything else is a
 * question people have AFTER they are interested, and `/pricing` is where they
 * are when they have it.
 */
export const HOMEPAGE_FAQ_KEYS = ['Is Todonado free?', 'What do I get with Pro?', 'Can I cancel?'] as const

export const HOMEPAGE_FAQ: Qa[] = HOMEPAGE_FAQ_KEYS.map((q) => {
  const found = FAQ.find((item) => item.q === q)
  if (!found) throw new Error(`FAQ entry missing for homepage question: ${q}`)
  return found
})
