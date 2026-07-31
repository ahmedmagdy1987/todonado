import { test, expect, type Page } from '@playwright/test'
import { cleanupLeftoverAccounts, createTestAccount, deleteTestAccount, signIn } from './fixtures'

/**
 * Generated sleep noise, proved to be actually playing.
 *
 * ── WHAT THIS CAN AND CANNOT PROVE ───────────────────────────────────────────
 * Playwright runs headless Chromium with `--mute-audio` always on (it is in
 * Playwright's own default switch list), so NO test anywhere can prove a
 * speaker made a sound. What it can prove is that the media pipeline is running
 * the audio: a real <audio> element exists, it is not paused, it has decoded
 * enough to play (readyState >= HAVE_FUTURE_DATA), it reports no error, and its
 * currentTime ADVANCES between two samples. A button label is not evidence and
 * is deliberately not used as any part of the claim.
 *
 * Autoplay: Chromium's stock desktop policy would usually be satisfied by
 * Playwright's real click, but nothing in this repo has ever depended on that.
 * The flag below removes the question entirely.
 */
test.use({
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
})

/** One sample of everything worth knowing about the element's real state. */
async function mediaState(page: Page) {
  return page.locator('audio').evaluate((el: HTMLAudioElement) => ({
    paused: el.paused,
    currentTime: el.currentTime,
    readyState: el.readyState,
    loop: el.loop,
    volume: el.volume,
    muted: el.muted,
    ended: el.ended,
    hasSrc: Boolean(el.currentSrc || el.src),
    error: el.error ? el.error.code : null,
  }))
}

test('sleep noise: the three generated tracks are live, and one really plays', async ({ page }) => {
  const account = await createTestAccount('sleep noise')
  await signIn(page, account)
  await page.goto('/wellness/sleep')
  await expect(page.getByRole('heading', { name: 'Sleep sounds', level: 2 })).toBeVisible()

  // --- The three noise tracks are NOT coming soon -------------------------
  //
  // Asserted as a Play button existing, because AudioSection renders either a
  // Play button or the "Audio coming soon" badge and never both.
  for (const title of ['White noise', 'Pink noise', 'Brown noise']) {
    await expect(
      page.getByRole('button', { name: `Play ${title}` }),
      `${title} should be playable, not "coming soon"`,
    ).toBeVisible()
  }

  // --- The recordings we have not licensed still say so --------------------
  await expect(page.getByText('Audio coming soon')).toHaveCount(3) // rain, thunder, ocean
  for (const title of ['Rain', 'Thunderstorm', 'Ocean']) {
    await expect(page.getByRole('button', { name: `Play ${title}` })).toHaveCount(0)
  }

  // --- Start one, and prove the pipeline is running ------------------------
  await page.getByRole('button', { name: 'Play White noise' }).click()
  await expect(page.locator('audio')).toHaveCount(1)

  // A decode failure unmounts the player for an alert; catch that loudly
  // rather than letting it read as "not started yet".
  await expect(page.getByRole('alert')).toHaveCount(0)

  await expect
    .poll(async () => (await mediaState(page)).readyState, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(3)

  const first = await mediaState(page)
  expect(first.error, 'the generated WAV failed to decode').toBeNull()
  expect(first.hasSrc, 'no source was attached').toBe(true)
  expect(first.paused, 'the element is paused').toBe(false)
  expect(first.loop, 'sleep noise must loop').toBe(true)

  // THE ACTUAL PROOF: the media clock moves on its own.
  await expect
    .poll(async () => (await mediaState(page)).currentTime, { timeout: 15_000 })
    .toBeGreaterThan(first.currentTime)

  // The fade-in ramps volume from 0 up to the slider value; by now it is audible.
  await expect.poll(async () => (await mediaState(page)).volume, { timeout: 5_000 }).toBeGreaterThan(0.1)

  await deleteTestAccount(account, 'sleep noise')
})

test('sleep noise: the sleep timer stops it', async ({ page }) => {
  /*
   * The shortest sleep timer the UI offers is five minutes, which no test
   * should sit through. Playwright's clock API fakes the page's timers, so the
   * deadline arrives immediately while the media element keeps its own clock.
   *
   * `install()` has to happen before the page loads, so it wraps the whole
   * journey; `runFor` then advances the fake timers on demand.
   */
  await page.clock.install()

  const account = await createTestAccount('sleep timer')
  await signIn(page, account)
  await page.goto('/wellness/sleep')
  await expect(page.getByRole('heading', { name: 'Sleep sounds', level: 2 })).toBeVisible()

  await page.getByRole('button', { name: 'Play Pink noise' }).click()
  await expect(page.locator('audio')).toHaveCount(1)
  await expect
    .poll(async () => (await mediaState(page)).readyState, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(3)
  expect((await mediaState(page)).paused).toBe(false)

  // Arm the shortest timer and confirm the countdown appears.
  await page.getByLabel('Sleep timer').selectOption('5')
  await expect(page.getByText(/stops in/i)).toBeVisible()

  // Five minutes plus the fade, in fake time.
  await page.clock.runFor('05:01')

  await expect
    .poll(async () => (await mediaState(page)).paused, { timeout: 10_000 })
    .toBe(true)

  await deleteTestAccount(account, 'sleep timer')
})

test.afterAll(cleanupLeftoverAccounts)
