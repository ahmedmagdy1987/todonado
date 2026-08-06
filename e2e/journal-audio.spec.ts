import { test, expect } from '@playwright/test'
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  cleanupLeftoverAccounts,
  createTestAccount,
  deleteTestAccount,
  rest,
  signIn,
  tableExists,
} from './fixtures'

/**
 * The journal-audio bucket, end to end, against the REAL bucket.
 *
 * MediaRecorder really encodes, the webm bytes really upload to Supabase
 * Storage, playback really goes through a signed URL, and the object is really
 * removed when the entry goes. Only `getUserMedia` is substituted, and only
 * because no browser available here has a microphone — see `stubMicrophone`,
 * which hands back a genuine `MediaStream` rather than a fake recorder.
 *
 * What is proven here is everything the client cannot check about itself:
 *
 *   • the object lands under `<user_id>/…`, which IS the authorisation
 *   • the signed URL serves real audio bytes
 *   • the PUBLIC url does not work, because the bucket is private
 *   • another signed-in user can neither read the object, list the folder, nor
 *     write into it
 *   • deleting the recording, and deleting the whole entry, both remove the
 *     object — no orphan left in a bucket that bills for it
 */
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-capture', '--autoplay-policy=no-user-gesture-required'],
  },
  permissions: ['microphone'],
})

/**
 * THE ONLY THING STUBBED IS `getUserMedia`, AND ONLY BECAUSE NO BROWSER HERE HAS
 * A MICROPHONE.
 *
 * `--use-fake-device-for-media-capture` does not produce an audio device in
 * Playwright's Chromium on this platform — measured, not assumed: getUserMedia
 * answers `NotSupportedError` bare, and `NotAllowedError` with the fake-UI flag,
 * in headless-shell, in new-headless, and headed, with the permission already
 * reported as `granted`.
 *
 * So the stub returns a REAL `MediaStream` — an oscillator wired into a
 * `MediaStreamDestination` — rather than a fake recorder. Everything downstream
 * of that stream is the genuine article: MediaRecorder encodes it, the encoder
 * produces real webm bytes, those bytes are uploaded to the real bucket, played
 * back through a real signed URL, and deleted through the real policies. The one
 * step not covered is Chromium capturing from hardware, which is not code this
 * project ships.
 */
async function stubMicrophone(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const make = () => {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctor()
      void ctx.resume()
      const dest = ctx.createMediaStreamDestination()
      const osc = ctx.createOscillator()
      osc.frequency.value = 440
      const gain = ctx.createGain()
      gain.gain.value = 0.2
      osc.connect(gain).connect(dest)
      osc.start()
      return dest.stream
    }
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      writable: true,
      value: async () => make(),
    })
  })
}

/** List the objects in a user's own folder, with that user's JWT. */
async function listObjects(token: string, prefix: string): Promise<string[]> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/journal-audio`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix, limit: 100 }),
  })
  if (!res.ok) return []
  const rows = (await res.json()) as { name: string }[]
  return rows.map((r) => r.name)
}

test('journal audio: record → upload → signed playback → delete leaves no orphan', async ({
  page,
}) => {
  const ready = await tableExists('journal_entries')
  test.skip(!ready, 'journal_entries does not exist yet')

  const account = await createTestAccount('journal audio')
  const other = await createTestAccount('journal audio intruder')

  await signIn(page, account)
  await stubMicrophone(page)
  await page.addInitScript(() => localStorage.setItem('todonado.plan', 'pro'))
  await page.goto('/journal')
  await expect(page.getByRole('heading', { name: 'Journal', level: 2 })).toBeVisible()

  // --- Record for real -----------------------------------------------------
  await page.getByLabel('What got done?').fill('Tested the microphone.')
  const record = page.getByRole('button', { name: /^Record$/ })
  await expect(record, 'Pro must get a real record control').toBeVisible()
  await record.click()

  // The timer is timestamp-derived, so this is genuinely ~3 seconds of audio.
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(3_000)
  await page.getByRole('button', { name: 'Stop' }).click()

  // A local preview appears BEFORE anything is uploaded — scrapping a take costs
  // nothing, which is the whole reason the upload waits for Save.
  await expect(page.getByLabel('New recording')).toBeVisible({ timeout: 20_000 })

  // --- Save: this is the upload --------------------------------------------
  await page.getByRole('button', { name: /Save entry/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({
    timeout: 30_000,
  })

  const rows = (await rest(
    'journal_entries?select=id,audio_path,audio_seconds',
    account.token,
  )) as { id: string; audio_path: string | null; audio_seconds: number | null }[]
  expect(rows).toHaveLength(1)
  const { audio_path: path, audio_seconds: seconds } = rows[0]
  expect(path, 'the row must point at an object').toBeTruthy()
  expect(seconds, 'a duration travels with the path').toBeGreaterThan(0)

  // THE KEY SHAPE IS THE AUTHORISATION — the storage policy requires it.
  expect(path!.split('/')[0]).toBe(account.userId)

  // --- The object is really there ------------------------------------------
  const objects = await listObjects(account.token, account.userId)
  expect(objects, 'the recording is in the bucket').toHaveLength(1)

  // --- Playback works, through a SIGNED url --------------------------------
  const signRes = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/journal-audio/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${account.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 600 }),
  })
  expect(signRes.ok, 'the owner can sign a playback url').toBeTruthy()
  const { signedURL } = (await signRes.json()) as { signedURL: string }
  const audio = await fetch(`${SUPABASE_URL}/storage/v1${signedURL}`)
  expect(audio.status, 'the signed url serves the clip').toBe(200)
  const bytes = Buffer.from(await audio.arrayBuffer())
  expect(bytes.byteLength, 'a real recording, not an empty file').toBeGreaterThan(1000)

  // --- …and the bucket is PRIVATE ------------------------------------------
  const publicTry = await fetch(`${SUPABASE_URL}/storage/v1/object/public/journal-audio/${path}`)
  expect(publicTry.ok, 'a private bucket must not serve a public url').toBeFalsy()

  const anonTry = await fetch(`${SUPABASE_URL}/storage/v1/object/journal-audio/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY },
  })
  expect(anonTry.ok, 'anonymous callers get nothing').toBeFalsy()

  // --- Another signed-in user gets nothing, either way ---------------------
  const intruderRead = await fetch(`${SUPABASE_URL}/storage/v1/object/journal-audio/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${other.token}` },
  })
  expect(intruderRead.ok, "another user cannot read someone else's recording").toBeFalsy()
  expect(await listObjects(other.token, account.userId), 'nor list the folder').toHaveLength(0)

  const intruderWrite = await fetch(
    `${SUPABASE_URL}/storage/v1/object/journal-audio/${account.userId}/planted.webm`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${other.token}`,
        'Content-Type': 'audio/webm',
      },
      body: 'not audio',
    },
  )
  expect(intruderWrite.ok, "nor write into someone else's folder").toBeFalsy()

  // --- Playback actually WORKS after a reload ------------------------------
  //
  // THIS USED TO ASSERT THE `src` ATTRIBUTE AND NOTHING ELSE, which is how a
  // dead player shipped: the deployed CSP is `media-src 'self' blob:`, the src
  // was an absolute signed URL on the Storage origin, and the browser refused
  // the media before any request left it. The element rendered, the controls
  // worked, no sound came out, and this assertion stayed green.
  //
  // A src attribute is not evidence. The media pipeline is, so that is what is
  // asserted now — the same standard e2e/sleep-sounds.spec.ts already holds.
  await page.reload()
  const player = page.getByLabel("Today's voice note")
  await expect(player).toBeVisible({ timeout: 30_000 })

  // The source must be a blob: URL, which is what `media-src blob:` permits.
  await expect(player).toHaveAttribute('src', /^blob:/)

  const playable = await player.evaluate(
    (el: HTMLAudioElement) =>
      new Promise<{ readyState: number; error: number | null; duration: number }>((resolve) => {
        const report = () =>
          resolve({
            readyState: el.readyState,
            error: el.error ? el.error.code : null,
            duration: Number.isFinite(el.duration) ? el.duration : -1,
          })
        if (el.readyState >= 2) return report()
        el.addEventListener('loadedmetadata', report, { once: true })
        el.addEventListener('error', report, { once: true })
        setTimeout(report, 15_000)
      }),
  )
  expect(playable.error, 'the recording must not fail to load').toBeNull()
  expect(playable.readyState, 'metadata must actually arrive').toBeGreaterThanOrEqual(2)

  // --- Deleting the entry deletes the object: NO ORPHANS -------------------
  //
  // The one that actually costs money if it is wrong. An orphaned object is
  // unreachable (the row that named it is gone) and billed forever.
  await page.getByRole('button', { name: /Delete the voice note/ }).click()
  await expect(page.getByLabel("Today's voice note")).toHaveCount(0, { timeout: 30_000 })
  await expect
    .poll(() => listObjects(account.token, account.userId), { timeout: 20_000 })
    .toHaveLength(0)

  await deleteTestAccount(other, 'journal audio intruder')
  await deleteTestAccount(account, 'journal audio')
})

test('journal audio: deleting a whole ENTRY takes its recording with it', async ({ page }) => {
  const ready = await tableExists('journal_entries')
  test.skip(!ready, 'journal_entries does not exist yet')

  const account = await createTestAccount('journal audio entry delete')
  await signIn(page, account)
  await stubMicrophone(page)
  await page.addInitScript(() => localStorage.setItem('todonado.plan', 'pro'))

  // Yesterday's entry, so the page lists it as a past entry with a delete button.
  const yesterday = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  // Record today, then move the row to yesterday — the UI cannot backdate, and
  // the point under test is the delete path, not the calendar.
  await page.goto('/journal')
  await page.getByRole('button', { name: /^Record$/ }).click()
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(2_500)
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByLabel('New recording')).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Anything else').fill('Recorded yesterday.')
  await page.getByRole('button', { name: /Save entry/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({
    timeout: 30_000,
  })

  const [row] = (await rest(
    'journal_entries?select=id,audio_path',
    account.token,
  )) as { id: string; audio_path: string }[]
  expect(row.audio_path).toBeTruthy()
  await rest(`journal_entries?id=eq.${row.id}`, account.token, {
    method: 'PATCH',
    body: { entry_date: yesterday },
  })
  expect(await listObjects(account.token, account.userId)).toHaveLength(1)

  await page.reload()
  await page.getByRole('button', { name: `Delete the entry for ${yesterday}` }).click()

  await expect
    .poll(
      async () => ((await rest('journal_entries?select=id', account.token)) as unknown[]).length,
      { timeout: 20_000 },
    )
    .toBe(0)
  await expect
    .poll(() => listObjects(account.token, account.userId), { timeout: 20_000 })
    .toHaveLength(0)

  await deleteTestAccount(account, 'journal audio entry delete')
})

test.afterAll(cleanupLeftoverAccounts)
