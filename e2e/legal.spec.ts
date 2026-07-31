import { test, expect } from '@playwright/test'

/**
 * The legal pages had NO browser coverage at all, which is how the Privacy
 * Policy came to sit at "June 16" while the app added a journal, voice
 * recordings in cloud storage, a supplement log and a quit tracker — none of
 * which it mentioned. Nothing failed, because nothing was looking.
 *
 * These tests are deliberately about TRUTH rather than layout: does the policy
 * name what the app actually stores, and does it stop naming a way to reach us
 * that we have replaced with a button?
 */

/** One source of truth — `LEGAL_CONTACT` in src/lib/config.ts. */
const CONTACT = 'support@todonado.com'

test('legal: both pages carry the same real contact address, on the product domain', async ({
  page,
}) => {
  for (const path of ['/privacy', '/terms']) {
    await page.goto(path)
    const main = page.locator('main')
    await expect(main.getByText(CONTACT).first()).toBeVisible()

    // The repo also contains `founder@todonado.app` — a TEST FIXTURE on a
    // different TLD. It must never reach a user-facing page.
    await expect(main).not.toContainText('todonado.app')
  }
})

test('legal: the pages are dated, and not left at a date the app has outgrown', async ({ page }) => {
  for (const path of ['/privacy', '/terms']) {
    await page.goto(path)
    const stamp = await page.locator('main').getByText(/Last updated:/i).first().textContent()
    expect(stamp, `${path} must show a last-updated date`).toBeTruthy()
    const parsed = new Date((stamp ?? '').replace(/^.*Last updated:\s*/i, ''))
    expect(Number.isFinite(parsed.getTime()), `${path} date parseable: ${stamp}`).toBe(true)
    // Compare CALENDAR DAYS, not instants: "July 31, 2026" parses as local
    // midnight while "2026-07-31" parses as UTC midnight, so a naive numeric
    // comparison fails by the timezone offset — east of UTC, on the very day
    // the page is correct.
    const asDay = [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, '0'),
      String(parsed.getDate()).padStart(2, '0'),
    ].join('-')
    // Older than the day voice recordings shipped means the prose predates the
    // most sensitive thing the app stores.
    expect(asDay >= '2026-07-31', `${path} is dated ${asDay}, before voice notes shipped`).toBe(true)
  }
})

test('legal: the privacy policy names everything the app actually stores', async ({ page }) => {
  await page.goto('/privacy')
  const text = ((await page.locator('main').textContent()) ?? '').toLowerCase()

  // Each entry is a real store the app writes to. If a feature is removed, the
  // line may go — but it may never go while the feature ships.
  for (const disclosure of [
    'voice',          // journal audio in the private bucket — the big one
    'journal',
    'vision',
    'mind map',
    'challenge',
    'quit',
    'supplement',
    'calendar',
    'focus session',
    'task',
  ]) {
    expect(text, `the privacy policy must disclose "${disclosure}"`).toContain(disclosure)
  }

  // Recordings are stored, not merely "processed" — say so plainly.
  expect(text).toMatch(/recording/)
})

test('legal: export and deletion point at the buttons that exist, not at an inbox', async ({
  page,
}) => {
  await page.goto('/privacy')
  const text = ((await page.locator('main').textContent()) ?? '').toLowerCase()

  // Both are BUILT (Settings → Export my data / Delete my account). Telling a
  // user to email for something that is two taps away sends them to a mailbox
  // for no reason — and one whose monitoring we cannot prove.
  expect(text).toContain('settings')
  expect(text).toContain('export my data')
  expect(text).toContain('delete my account')

  // A JSON file cannot hold audio, and the policy must not imply otherwise.
  expect(text).toMatch(/cannot (contain|hold) audio|not embedded/)
})

test('legal: the terms carry the not-medical-advice clause while the trackers ship', async ({
  page,
}) => {
  await page.goto('/terms')
  const text = ((await page.locator('main').textContent()) ?? '').toLowerCase()
  expect(text).toContain('not medical advice')
  expect(text).toMatch(/diagnosis|treatment/)
  expect(text).toMatch(/doses?|interactions?/)
})

test('legal: neither page tells the reader to go and hire a lawyer', async ({ page }) => {
  // The old intros said "review it with your own legal advisor before relying
  // on it" — honest about the draft's provenance, but aimed at entirely the
  // wrong reader. Nobody should need counsel to find out what happens to their
  // own data. (Whether WE have had them reviewed is tracked in
  // docs/LAUNCH_CHECKLIST.md §3.2, where it belongs.)
  for (const path of ['/privacy', '/terms']) {
    await page.goto(path)
    const text = ((await page.locator('main').textContent()) ?? '').toLowerCase()
    expect(text, `${path} should not send the reader to a lawyer`).not.toMatch(
      /your own legal advisor|consult (a|your) lawyer/,
    )
  }
})
