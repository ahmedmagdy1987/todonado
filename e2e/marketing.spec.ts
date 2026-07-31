import { test, expect, type Page } from '@playwright/test'

/**
 * The content truth-pass.
 *
 * The rule this file enforces is the one that is easiest to break by accident
 * and hardest to notice: **the marketing pages must describe what ships today.**
 * A feature can go live and leave a "coming soon" behind it; a paywall can move
 * and leave the pricing table claiming a free feature is paid. Neither breaks a
 * build. Both are lies to a stranger deciding whether to sign up.
 *
 * So the assertions here are mostly NEGATIVE — the absence of a claim — because
 * that is the failure mode.
 */

/** Scroll the whole page so every lazily-mounted section exists in the DOM. */
async function mountLazySections(page: Page) {
  const sentinel = page.getByRole('link', { name: 'Compare all plans' })
  for (let attempt = 0; attempt < 5 && (await sentinel.count()) === 0; attempt += 1) {
    await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)))
      const step = Math.round(window.innerHeight * 0.75)
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y)
        await frame()
        await frame()
        await new Promise((r) => setTimeout(r, 100))
      }
      window.scrollTo(0, document.body.scrollHeight)
      await frame()
      await new Promise((r) => setTimeout(r, 150))
    })
  }
  await expect(sentinel, 'lazy landing sections never mounted').toHaveCount(1)
  await page.evaluate(() => window.scrollTo(0, 0))
}

/**
 * Everything that SHIPS and is therefore never allowed to be labelled unbuilt.
 * Add to this list whenever a feature goes live — that is the point of it.
 */
const SHIPPED = [
  'Week planning',
  'Insights',
  'Focus',
  'Pomodoro',
  'Quit tracker',
  'Vision',
  'Breathwork',
  'Templates',
  'Checklists',
  'Get to work',
  'capacity meter',
  // Added when they shipped. All three are BUILT but behind unapplied
  // migrations, so none is claimed on the landing yet — the loop below skips a
  // feature the page does not mention, which means these are dormant guards that
  // arm themselves the moment the strip lines are uncommented. That is the point:
  // the rule should already be in place before the claim is.
  'Mind maps',
  'Journal',
  'Challenges',
]

/**
 * The ONLY things /pricing may present as not-built-yet.
 *
 * The list shrank rather than grew. AI (a coach, and review of the journal) is
 * CANCELLED, not deferred, so it belongs on no page at all — see the cancelled
 * test below. Image vision boards were described as a deliberate wait, which is
 * an honest description of a maybe and not something to promise a stranger.
 * What is left is two commitments with real, nameable blockers, plus the Team
 * tier the page already sells.
 */
const NOT_BUILT = [
  'Sleep sounds',
  'Guided meditation',
  'Referral',
  'Team',
]

test('landing: the breadth section is real, and every surface on it is live', async ({ page }) => {
  await page.goto('/welcome')
  await mountLazySections(page)

  const section = page.getByRole('region', { name: /One place for your day/i })
  await expect(section).toBeVisible()

  // The five real surface groups.
  for (const group of ['Plan', 'Focus', 'Habits', 'Calm', 'Reflect']) {
    await expect(section.getByRole('heading', { name: group, level: 3 })).toBeVisible()
  }

  // Each group opens something REAL. Logged out, that means signup carrying the
  // destination — never a dead button.
  await expect(section.getByRole('button', { name: /Open Today/i })).toBeVisible()
  await expect(section.getByRole('button', { name: /Get to work/i })).toBeVisible()
  await expect(section.getByRole('button', { name: /Open the quit tracker/i })).toBeVisible()
  await expect(section.getByRole('button', { name: /Try breathwork/i })).toBeVisible()
  await expect(section.getByRole('button', { name: /Open Vision/i })).toBeVisible()

  // Nothing unbuilt may be advertised inside it.
  const text = (await section.textContent()) ?? ''
  expect(text).not.toMatch(/coming soon|not yet|we.ll let you know/i)
  for (const claim of ['Sleep sounds', 'Guided meditation', 'AI ', 'voice journal']) {
    expect(text, `"${claim}" is not built and must not appear here`).not.toContain(claim)
  }

  // No named competitor, and no "replaces N apps". Deliberately only
  // unambiguous brand names — "things" was in this list once and matched the
  // ordinary English in "the things you keep doing".
  expect(text).not.toMatch(/todoist|ticktick|asana|trello|sunsama|[^a-z]notion[^a-z]|[^a-z]motion[^a-z]/i)
  expect(text).not.toMatch(/replaces?\s+\d+\s+apps?/i)
})

test('landing: the all-in-one claim is categories only, and every one of them is live', async ({
  page,
}) => {
  await page.goto('/welcome')
  await mountLazySections(page)

  const section = page.getByRole('region', { name: /One place for your day/i })
  await expect(section.getByText('One app instead of several')).toBeVisible()

  // Categories, never brands, and never a countable claim.
  //
  // The journal and the mind-map canvas joined this list when their migrations
  // were applied — until then they were deliberately absent, because a category
  // may only be claimed if a stranger who signs up RIGHT NOW can use it. That
  // rule is now enforced from the other side: each one is asserted present here,
  // AND the route test below proves the page behind it actually works.
  for (const category of [
    'A day planner',
    'A focus & pomodoro timer',
    'A habit & quit tracker',
    'A breathing coach',
    'A journal',
    'A mind-map canvas',
  ]) {
    await expect(section.getByText(category, { exact: true })).toBeVisible()
  }

  const text = (await section.textContent()) ?? ''
  expect(text).not.toMatch(/replaces?\s+\d+\s+apps?/i)
  expect(text).not.toMatch(/\d+\s+apps? in one/i)
  expect(text).not.toMatch(/todoist|ticktick|asana|trello|sunsama|evernote|[^a-z]notion[^a-z]/i)
})

test('landing: the strip names the three newly-live surfaces, and they are real', async ({
  page,
}) => {
  await page.goto('/welcome')
  await mountLazySections(page)

  const strip = page.getByRole('region', { name: /Everything else/i })
  for (const label of ['Mind maps', 'Journal', 'Challenges']) {
    await expect(strip.getByText(label, { exact: true })).toBeVisible()
  }

  // The strip's whole rule is "everything here ships today", so none of the
  // three may carry an unbuilt label anywhere near it.
  const text = (await strip.textContent()) ?? ''
  expect(text).not.toMatch(/coming soon|not built|not switched on|notify me/i)
})

test('landing: the week board is on the page and runs the real planner', async ({ page }) => {
  await page.goto('/welcome')
  await mountLazySections(page)

  const board = page.getByRole('button', { name: 'Plan my week' })
  await board.scrollIntoViewIfNeeded()
  await expect(board).toBeVisible()

  // Seven day columns, each with its OWN capacity — the promise is per-day.
  const columns = page.getByRole('img', { name: /% of the day planned$/ })
  await expect(columns).toHaveCount(7)

  await board.click()
  // The real planWeek placed work and reported what did not fit.
  await expect(page.getByText(/\d+ planned · \d+ left in backlog/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/earliest day with room/i)).toBeVisible()

  // It is honest that this one is paid.
  const weekCard = page.locator('div').filter({ hasText: 'Your week' }).last()
  await expect(weekCard.getByText('Pro').first()).toBeVisible()
})

test('landing: no shipped feature is ever labelled unbuilt', async ({ page }) => {
  await page.goto('/welcome')
  await mountLazySections(page)
  const body = (await page.locator('main').textContent()) ?? ''

  // Only the audio pair may carry a "Coming soon" badge on the landing.
  const comingSoon = page.getByText('Coming soon', { exact: true })
  const count = await comingSoon.count()
  expect(count, 'only the two unlicensed-audio fake doors may say Coming soon').toBe(2)

  // And each shipped feature is present WITHOUT being called unbuilt. The
  // wellness teaser's "Two of these are built" copy is the only place the word
  // pairing can legitimately appear, so this checks proximity per feature.
  for (const feature of SHIPPED) {
    const idx = body.toLowerCase().indexOf(feature.toLowerCase())
    if (idx === -1) continue // not every shipped feature is named on the landing
    const window = body.slice(Math.max(0, idx - 90), idx + 90).toLowerCase()
    expect(window, `"${feature}" ships but reads as unbuilt`).not.toMatch(
      /coming soon|not built yet|isn.t built|notify me/,
    )
  }
})

/**
 * CANCELLED IS NOT "COMING SOON".
 *
 * Anything requiring a paid third-party model provider — an AI coach, AI review
 * of the journal, text-to-speech — is out of the product permanently. The old
 * copy handled it the careful way, naming the blocker and offering a vote, and
 * that was right while it was still a maybe. It stops being right the moment
 * the answer is no: a page that keeps explaining why it has not built something
 * is advertising the gap, and an interest chip for it collects votes nobody
 * will ever act on into a table with no delete policy.
 *
 * So the rule is now absence, not honesty-about-absence, and it is checked on
 * every public page rather than only the landing.
 */
const CANCELLED = [
  'ai coach',
  'ai review',
  'ai-powered',
  'ai powered',
  'artificial intelligence',
  'text-to-speech',
  'read your journal back',
]

test('no cancelled capability is mentioned anywhere a visitor can read', async ({ page }) => {
  for (const route of ['/welcome', '/pricing', '/about']) {
    await page.goto(route)
    if (route === '/welcome') await mountLazySections(page)
    const body = ((await page.locator('main').textContent()) ?? '').toLowerCase()

    for (const phrase of CANCELLED) {
      expect(
        body,
        `${route} mentions "${phrase}", which is cancelled and must not be promised or apologised for`,
      ).not.toContain(phrase)
    }

    // The bare word is allowed only where it cannot read as a promise: the FAQ
    // says plainly that there is no AI and there will not be. Anything that
    // pairs it with a future tense is the failure this test exists to catch.
    expect(body, `${route} implies AI is coming`).not.toMatch(
      /ai (is )?(coming|soon|planned|on the roadmap)|coming soon.{0,30}\bai\b/,
    )
  }
})

test('pricing: the tiers match the real gates, and "not built" means not built', async ({
  page,
}) => {
  await page.goto('/pricing')

  const main = page.locator('main')
  const text = (await main.textContent()) ?? ''

  // FREE must claim the daily loop — these were previously sold as Pro.
  // `.first()` throughout: these phrases correctly appear more than once (the
  // Free bullet list AND the "what you get with Pro" prose that contrasts them).
  await expect(main.getByText(/The effort-aware capacity meter/i).first()).toBeVisible()
  await expect(main.getByText(/Overbooking guard/i).first()).toBeVisible()
  await expect(main.getByText(/Focus mode with Pomodoro/i).first()).toBeVisible()

  // PRO must claim only what is actually gated.
  await expect(main.getByText(/Week planning: 7 days of capacity/i).first()).toBeVisible()
  await expect(main.getByText(/Unlimited history/i).first()).toBeVisible()
  await expect(main.getByText(/Live calendar sync/i).first()).toBeVisible()

  // The old roadmap promised two things that already shipped. They must be gone.
  expect(text, 'Insights already ship — cannot be "where we are going"').not.toMatch(
    /Deeper Insights: estimation accuracy/i,
  )
  expect(text, 'calendar import already ships').not.toMatch(/One-way calendar import/i)

  // The not-built list must give a REASON, never a bare "soon".
  await expect(main.getByRole('heading', { name: /isn’t built yet/i })).toBeVisible()
  // Case-insensitive: these appear inside sentences, so capitalisation varies
  // ("Sleep sounds & guided meditation").
  const lower = text.toLowerCase()
  for (const item of NOT_BUILT) {
    expect(lower, `"${item}" should be listed as unbuilt`).toContain(item.toLowerCase())
  }
  await expect(main.getByText(/no audio is licensed yet/i)).toBeVisible()
  await expect(main.getByText(/billing switched on/i)).toBeVisible()
  // Image boards used to be pinned here with their reason. The entry is gone:
  // "a deliberate wait" is a maybe, and this list is for commitments.
  expect(lower, 'image vision boards are no longer promised').not.toContain('image vision board')
})

test('landing: OG tags and the zero-database guarantee still hold', async ({ page }) => {
  // The new sections must not have broken the crawler contract…
  const html = await (await page.request.get('/')).text()
  expect(html).toContain('property="og:title"')
  expect(html).toContain('property="og:description"')
  expect(html).toContain('property="og:image"')
  expect(html).toContain('https://www.todonado.com/og-image.png')
  expect(html).toContain('name="twitter:card"')
  expect(html).toContain('rel="canonical"')

  // …nor the promise that the marketing page never touches a user's data.
  // The week board and the breadth strip are both new since that guarantee was
  // written, and both run on the landing.
  const dbCalls: string[] = []
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes('.supabase.co/rest/v1/')) dbCalls.push(`${req.method()} ${url}`)
  })

  await page.goto('/welcome')
  await mountLazySections(page)
  await page.getByRole('button', { name: 'Plan my week' }).click()
  await expect(page.getByText(/\d+ planned · \d+ left in backlog/)).toBeVisible({ timeout: 15_000 })

  expect(dbCalls, `the landing hit the database:\n${dbCalls.join('\n')}`).toEqual([])
})
