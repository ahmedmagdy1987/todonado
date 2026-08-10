import { test, expect, type Page } from '@playwright/test'
import { isSupabaseRestCall } from './supabaseTarget'

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
  // Added the day the noise tracks shipped. Sleep sounds spent months on the
  // NOT_BUILT list below and moved across, which is exactly the transition this
  // pair of lists exists to make impossible to fudge.
  'Sleep sounds',
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
 *
 * 'Sleep sounds' USED TO BE THE FIRST ENTRY. It is now in SHIPPED above, and
 * what replaced it is deliberately narrower: the rain, thunder and ocean
 * recordings nobody has licensed. The noise tracks that shipped are generated
 * on the device, so they were never waiting on a file. Naming the half that is
 * still missing is the difference between an honest list and a stale one.
 *
 * It was called 'Recorded ambience' until the copy pass: "ambience" as a noun
 * for audio tracks is industry vocabulary, and this list is read by visitors.
 */
const NOT_BUILT = [
  'Recorded nature sounds',
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
  // 'Sleep sounds' left this list when it shipped, and the strip now claims
  // "Sleep noise with a sleep timer" under Calm. What replaced it is the half
  // that is still missing: no recording may be advertised here until it is
  // licensed, and naming them individually is what makes that checkable.
  for (const claim of ['Guided meditation', 'AI ', 'voice journal', 'Rain', 'Ocean']) {
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
  await expect(page.getByText(/\d+ planned · \d+ left for later/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/earliest day with room/i)).toBeVisible()

  // It is honest that this one is paid.
  const weekCard = page.locator('div').filter({ hasText: 'Your week' }).last()
  await expect(weekCard.getByText('Pro').first()).toBeVisible()
})

test('landing: no shipped feature is ever labelled unbuilt', async ({ page }) => {
  await page.goto('/welcome')
  await mountLazySections(page)
  const body = (await page.locator('main').textContent()) ?? ''

  // Guided meditation is the LAST fake door on the landing. It was two until
  // the noise tracks shipped; an exact count is what forces this number down
  // when a fake door becomes a feature, instead of letting a stale badge sit
  // next to something that works.
  const comingSoon = page.getByText('Coming soon', { exact: true })
  const count = await comingSoon.count()
  expect(count, 'only guided meditation is still unlicensed').toBe(1)

  // And each shipped feature is present WITHOUT being called unbuilt. The
  // wellness teaser's intro is the only place the word pairing can legitimately
  // appear, so this checks proximity per feature. (That intro deliberately says
  // what the last module still NEEDS rather than what it is not, precisely so it
  // cannot trip this guard.)
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

  // FREE must claim the whole day — these were previously sold as Pro.
  // `.first()` throughout: these phrases correctly appear more than once (the
  // Free bullet list AND the "what you get with Pro" prose that contrasts them).
  await expect(main.getByText(/capacity meter that shows what actually fits/i).first()).toBeVisible()
  await expect(main.getByText(/warning before you overbook/i).first()).toBeVisible()
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
  // This used to read /no audio is licensed yet/, which stopped being true the
  // day the noise tracks shipped: SOME audio works now and none of it is
  // licensed, because it is generated. The entry has to say which half is
  // missing AND that the other half already works, or a visitor reading the
  // not-built list would conclude the whole section is silent.
  await expect(main.getByText(/none of that is licensed yet/i)).toBeVisible()
  await expect(main.getByText(/generated noise tracks work today/i)).toBeVisible()
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
    // Matched against the CONFIGURED origin. The old literal hostname match
    // is never true against a local stack, so it used to pass vacuously.
    if (isSupabaseRestCall(url)) dbCalls.push(`${req.method()} ${url}`)
  })

  await page.goto('/welcome')
  await mountLazySections(page)
  await page.getByRole('button', { name: 'Plan my week' }).click()
  await expect(page.getByText(/\d+ planned · \d+ left for later/)).toBeVisible({ timeout: 15_000 })

  expect(dbCalls, `the landing hit the database:\n${dbCalls.join('\n')}`).toEqual([])
})

/* ─────────────────────────── PRICE CONSISTENCY ─────────────────────────────
 *
 * The public pricing page displayed "$6 /mo · per month, billed yearly" while
 * Stripe was configured and live-tested at $5/month and $48/year. Nothing
 * compared a rendered price with anything, so a visitor was quoted a number
 * the product does not charge and every gate stayed green.
 *
 * These read the RENDERED page, which is the only place the bug was visible.
 */

const PRICING_SURFACES = ['/pricing', '/welcome'] as const

test('pricing: the public page quotes $5/month and $48/year, on desktop and mobile', async ({
  page,
}) => {
  for (const route of PRICING_SURFACES) {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(route)
      // The teaser is below the fold on /welcome and lazily mounted.
      await page.evaluate(async () => {
        const step = Math.round(window.innerHeight * 0.8)
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 90))
        }
      })
      const body = await page.locator('body').innerText()
      const where = `${route} @ ${width}px`

      expect(body, `${where}: monthly price missing`).toContain('$5')
      expect(body, `${where}: yearly price missing`).toContain('$48')
      // The equivalent must never appear without its qualifier.
      if (/\$4(?!\d)/.test(body)) {
        expect(body, `${where}: "$4" shown without "billed annually"`).toContain('billed annually')
      }
      // The value that actually shipped, and the classic mislabellings.
      expect(body, `${where}: stale $6 price still rendered`).not.toMatch(/\$6(?!\d)/)
      expect(body, `${where}`).not.toContain('$48/month')
      expect(body, `${where}`).not.toContain('$4/year')
      expect(body, `${where}`).not.toContain('$5/year')
      // The period was previously stated twice and then contradicted.
      expect(body, `${where}: redundant period label`).not.toContain('/mo · per month')
    }
  }
})

test('pricing: the annual saving is stated as 20%, and the arithmetic holds', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/pricing')
  // /pricing is a lazy route chunk: without this the body is still "Loading…".
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const body = await page.locator('body').innerText()

  // 12 x $5 = $60;  $60 - $48 = $12;  $12 / $60 = 20%.
  expect(body).toMatch(/save\s*20%/i)
  expect(body, 'a wrong discount is worse than none').not.toMatch(/save\s*(?!20%)\d+%/i)
})

test('pricing: the intro states the real offer, with no pre-Stripe language left', async ({
  page,
}) => {
  /*
   * The page used to say "Prices are an early hypothesis we're still
   * validating, and nothing is charged yet" directly above the real amounts.
   * Stripe is configured, so that line contradicted the numbers beside it.
   */
  for (const route of ['/pricing', '/welcome']) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.8)
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 90))
      }
    })
    const body = await page.locator('body').innerText()
    const lower = body.toLowerCase()

    expect(body, `${route}: approved copy missing`).toContain(
      'Start free. Upgrade to Pro anytime from your plan settings.',
    )
    expect(body, `${route}: supporting price line missing`).toContain(
      'Pro is $5/month or $48/year.',
    )

    for (const stale of [
      'early hypothesis',
      'nothing is charged',
      'willingness-to-pay',
      'fake door',
      'test these numbers',
    ]) {
      expect(lower, `${route} still renders "${stale}"`).not.toContain(stale)
    }
  }
})

test('pricing: signed-out visitors see prices without authenticating', async ({ page }) => {
  // No session is ever created here: the whole point is that the price is
  // public. A pricing page that needed a login would be the same bug wearing
  // a different hat.
  const dbCalls: string[] = []
  page.on('request', (req) => {
    if (/\/auth\/v1\/(token|user|signup)/.test(req.url())) dbCalls.push(req.url())
  })
  await page.goto('/pricing')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const body = await page.locator('body').innerText()
  expect(body).toContain('$5')
  expect(body).toContain('$48')
  expect(new URL(page.url()).pathname, 'pricing must not redirect to auth').toBe('/pricing')
  expect(dbCalls, 'pricing must not require a session').toEqual([])
})

test('pricing: the Pro CTA still reaches the existing checkout entry point', async ({ page }) => {
  // Behaviour must be UNCHANGED by a copy fix: the paid CTA opens the same
  // intent modal it did before, and never navigates a signed-out visitor to
  // Stripe.
  await page.goto('/pricing')
  const before = new URL(page.url()).pathname
  await page.getByRole('button', { name: 'Start Pro' }).first().click()
  await page.waitForTimeout(700)
  expect(new URL(page.url()).pathname, 'the CTA must not navigate away').toBe(before)
  expect(page.url(), 'a signed-out CTA must never reach Stripe').not.toContain('checkout.stripe.com')
})
