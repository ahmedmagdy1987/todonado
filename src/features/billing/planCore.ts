/**
 * Entitlement resolution shared by the CLIENT and the SERVERLESS FUNCTIONS.
 *
 * This is a LEAF module: no `@/` imports, no `import.meta`, no browser globals —
 * so `api/` can import it directly (see tsconfig.api.json's include list, the
 * same pattern webhookMapping.ts uses). Keeping it here rather than duplicating
 * the founding allowlist in `api/` means the client gate and the server gate can
 * never disagree about who is Pro.
 *
 * `plan.ts` re-exports everything below, so existing client imports are unchanged.
 */

export type Plan = 'free' | 'pro'

/**
 * Founding / owner accounts that get full Pro access for dogfooding and demos.
 *
 * THIS LIST IS A STOPGAP AND SHOULD BE DELETED (audit FLAG-8).
 *
 * Granting entitlement by matching an email STRING is fragile, because email is
 * a self-service attribute: signup is free and autoconfirmed. If an address
 * here were ever unregistered — or added before its owner registers it, which
 * is the documented workflow — a stranger could register it and be handed
 * server-side Pro.
 *
 * THE REAL FIX IS A BILLING ROW, and it needs no code:
 *
 *   insert into public.billing (user_id, plan, subscription_status)
 *   select id, 'pro', 'founding' from auth.users where email = '<address>'
 *   on conflict (user_id) do update set plan = 'pro';
 *
 * `billing` has no client write path (SELECT-own RLS, service-role writes
 * only), so a row there is data the user cannot set — which is exactly what an
 * email string is not. Once every founding account has one, empty this array;
 * `resolveEffectivePlan` already prefers `billingPlan === 'pro'`, so the switch
 * is invisible to everyone holding a seeded row. The runbook step is in
 * docs/BILLING_SETUP.md.
 *
 * Until then the two guards below make it as robust as a string can be.
 */
export const FOUNDING_EMAILS: readonly string[] = [
  'journeypixofficial@gmail.com',
  'ahmedkassim17777@gmail.com',
]

/**
 * Reject an address whose local part carries a sub-address or dots.
 *
 * WHY: `ahmed.kassim17777@gmail.com` and `ahmedkassim17777+x@gmail.com` are
 * delivered to the same Gmail inbox but are DIFFERENT strings, and providers
 * differ on which aliasing they honour. Rather than guess a normalisation —
 * which would silently WIDEN the grant to addresses nobody listed — anything
 * aliased is refused outright. A founding account signs in with the exact
 * address on the list or it does not get founding access.
 */
function isAliasedLocalPart(email: string): boolean {
  const localPart = email.slice(0, email.lastIndexOf('@'))
  return localPart.includes('+') || localPart.includes('.')
}

export function isFoundingEmail(
  email: string | null | undefined,
  list: readonly string[] = FOUNDING_EMAILS,
): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  if (!normalized.includes('@')) return false
  // An aliased address can never match, even if the alias is itself listed —
  // the list is meant to hold canonical addresses only.
  if (isAliasedLocalPart(normalized)) return false
  return list.some((e) => e.trim().toLowerCase() === normalized)
}

/**
 * The effective plan once real billing exists. Precedence (highest first):
 *   1. `billingPlan === 'pro'`  — a real, paid Stripe subscription (source of truth).
 *   2. FOUNDING_EMAILS          — owner/dogfooding access (kept).
 *   3. `override`               — the dev-only localStorage preview (kept, documented).
 *   4. Free.
 * Pure + unit-tested. Everything else in the app depends only on `usePlan`.
 *
 * SERVER NOTE: callers on the server MUST NOT pass `override` — it originates
 * from client-controlled localStorage. `resolveServerPlan` in
 * api/_lib/entitlement.ts deliberately omits it.
 */
export function resolveEffectivePlan(args: {
  billingPlan?: Plan | null
  email?: string | null
  override?: Plan | null
  foundingList?: readonly string[]
  /**
   * Has the address been confirmed? Founding access requires it (audit FLAG-8).
   *
   * Defaults to TRUE, and that default is deliberate rather than lax: the
   * CLIENT has no trustworthy way to know, and the client gate is only a UX
   * affordance — every Pro-only endpoint re-resolves server-side. The SERVER
   * caller (api/_lib/entitlement.ts) always passes the real value, so the
   * decision that actually controls access is never taken on a default.
   */
  emailVerified?: boolean
}): Plan {
  const {
    billingPlan,
    email,
    override,
    foundingList = FOUNDING_EMAILS,
    emailVerified = true,
  } = args
  if (billingPlan === 'pro') return 'pro'
  if (emailVerified && isFoundingEmail(email, foundingList)) return 'pro'
  if (override === 'pro' || override === 'free') return override
  return 'free'
}
