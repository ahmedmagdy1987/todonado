// Relative imports MUST carry .js — see the note in create-checkout-session.ts.
import { serverEnv } from './_lib/config.js'
import { getSupabaseAdmin, getUserFromAuthHeader } from './_lib/supabase.js'
import { apiError, json, withErrorBoundary } from './_lib/http.js'
import { toNodeHandler } from './_lib/nodeAdapter.js'
import { enforceRateLimit } from './_lib/rateLimit.js'
import {
  checkFeature,
  ENTITLEMENT_RETRY_AFTER_SECONDS,
  ENTITLEMENT_UNAVAILABLE_CODE,
  ENTITLEMENT_UNAVAILABLE_STATUS,
  resolveServerEntitlement,
} from './_lib/entitlement.js'

/**
 * SERVER-AUTHORISED VOICE-NOTE UPLOAD.
 *
 * ── THE PROBLEM THIS EXISTS TO SOLVE ───────────────────────────────────────
 *
 * Voice notes are sold as Pro and, until this endpoint, were gated by a render
 * branch and a client-side check on the save path. Both are suggestions: the
 * browser holds a Supabase session, and the bucket's INSERT policy authorises on
 * the first path segment matching `auth.uid()` — OWNERSHIP, never plan. So any
 * Free session could upload directly, and a trigger on `journal_entries` cannot
 * help because the OBJECT lands before the row is ever written.
 *
 * The only mechanism that puts a server between a browser and Storage without
 * proxying the bytes is a short-lived signed upload URL, minted here after the
 * plan has been resolved from the database.
 *
 * ── THE SERVER CHOOSES THE PATH. THAT IS THE SECURITY PROPERTY. ────────────
 *
 * The caller sends a date, never a key. The handler builds
 * `<user.id>/<entryDate>-<random>.webm` from the id in the VERIFIED JWT, so a
 * token can only ever write into the caller's own folder, whatever the client
 * asks for. Accepting a caller-supplied path would hand back exactly the
 * authorisation the bucket policy is trying to enforce.
 *
 * ── WHAT THIS DOES NOT YET CLOSE ───────────────────────────────────────────
 *
 * The direct path is still open, because `journal_audio_insert_own` still lets
 * an authenticated owner INSERT. Narrowing it is a storage-policy migration,
 * prepared for review in docs/proposals/ and deliberately not applied. Until it
 * lands this endpoint is the SANCTIONED path rather than the ONLY one, and
 * docs/ENTITLEMENTS.md says so rather than implying enforcement it does not have.
 */

/** The one place the object key shape is decided. */
const AUDIO_BUCKET = 'journal-audio'

/**
 * How long the caller has to start the upload.
 *
 * Long enough to cover a slow phone finishing a recording and a flaky network,
 * short enough that a token lifted from a log is worthless. The upload itself
 * may take longer; the deadline is on STARTING it.
 */
const UPLOAD_URL_TTL_SECONDS = 120

/** `YYYY-MM-DD`, and a real date rather than merely digit-shaped. */
function isValidEntryDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/**
 * Mirrors `audioKey` in src/features/journal/journal.ts.
 *
 * Duplicated rather than imported because that module is not a leaf (it pulls
 * `@/types/database` and the history window), and `api/` may only import
 * dependency-free modules. `journalAudioKeyContract.test.ts` asserts the two
 * shapes stay identical, so the duplication cannot drift.
 */
function serverAudioKey(userId: string, entryDate: string, unique: string): string {
  return `${userId}/${entryDate}-${unique}.webm`
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return apiError(405, 'method_not_allowed')

  const env = serverEnv()
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) return apiError(503, 'not_configured')

  const user = await getUserFromAuthHeader(
    req.headers.get('authorization'),
    env.supabaseUrl,
    env.supabaseServiceRoleKey,
  )
  if (!user) return apiError(401, 'unauthorized')

  const limit = enforceRateLimit('journalAudio', user.id, req)
  if (!limit.allowed) {
    return apiError(429, 'rate_limited', { retry_after: limit.retryAfterSeconds })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = null
  }
  const entryDate = (body as { entryDate?: unknown } | null)?.entryDate
  if (!isValidEntryDate(entryDate)) return apiError(400, 'invalid_request')

  const admin = getSupabaseAdmin(env.supabaseUrl, env.supabaseServiceRoleKey)

  /*
   * THREE OUTCOMES, NOT TWO. `unavailable` is answered 503, never 403: a 403
   * tells a paying customer they are not entitled, and refusing to record
   * someone's journal because a billing read blipped is the silent downgrade
   * the entitlement module exists to prevent.
   */
  const entitlement = await resolveServerEntitlement(
    admin,
    user.id,
    user.email,
    user.emailVerified,
  )
  if (entitlement.status === 'unavailable') {
    return apiError(ENTITLEMENT_UNAVAILABLE_STATUS, ENTITLEMENT_UNAVAILABLE_CODE, {
      reason: entitlement.reason,
      retry_after: ENTITLEMENT_RETRY_AFTER_SECONDS,
    })
  }
  if (checkFeature(entitlement, 'journal.voiceNotes') !== 'allowed') {
    return apiError(403, 'pro_required')
  }

  // Built from the VERIFIED id, never from the request body.
  const unique = Math.random().toString(36).slice(2, 10)
  const path = serverAudioKey(user.id, entryDate, unique)

  const { data, error } = await admin.storage
    .from(AUDIO_BUCKET)
    .createSignedUploadUrl(path, { upsert: false })

  if (error || !data?.token) {
    console.error('[api/journal-audio-upload-url] could not sign an upload:', error?.message)
    return apiError(500, 'storage_unavailable')
  }

  /*
   * The TOKEN and the PATH, not the full signed URL. `uploadToSignedUrl` takes
   * exactly these two, and returning the assembled URL would put the project
   * host in a response body for no benefit.
   *
   * No-store: this is a single-use credential.
   */
  return json(
    200,
    { path, token: data.token, expiresInSeconds: UPLOAD_URL_TTL_SECONDS },
    { 'cache-control': 'no-store' },
  )
}

/** Web-shaped handler — exported for unit tests. */
export const webHandler = withErrorBoundary(handler)
/** Vercel invokes the legacy (req, res) contract — see _lib/nodeAdapter.ts. */
export default toNodeHandler(webHandler)
