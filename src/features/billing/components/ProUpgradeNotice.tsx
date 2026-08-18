import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { captureUpgradeIntent } from '@/features/marketing/api/upgradeIntents'
import { isGrandfathered, type LimitKey, type PlanTier } from '../entitlements'
import { UPGRADE_COPY, UPGRADE_CTA, UPGRADE_ROUTE, type UpgradeKey } from '../upgradeCopy'

/**
 * THE ONE WAY THIS PRODUCT ASKS FOR MONEY.
 *
 * ── WHAT IT REPLACES ───────────────────────────────────────────────────────
 *
 * Five near-identical limit cards, each with its own copy, its own intent
 * source string and its own idea of what the call to action should say. They
 * had already drifted: four explained that existing items keep working and one
 * did not, which is the single most important sentence on a card like this.
 *
 * ── IT IS A NOTE IN THE FLOW, NOT A MODAL ──────────────────────────────────
 *
 * No dialog, no overlay, no countdown, no fake scarcity, and nothing that has
 * to be dismissed before the page can be used again. A user who has just been
 * stopped from doing something is already having a slightly worse minute than
 * they expected; interrupting them on top of that is how a reasonable limit
 * starts to feel like a shakedown.
 *
 * ── IT ONLY EVER APPEARS ON A DECIDED `atLimit` OR `locked` ────────────────
 *
 * Never while entitlement is resolving. That is enforced by the callers, which
 * pass a three-state verdict, and it matters more than it looks: the click here
 * writes an `upgrade_intents` row, and that table has no delete policy by
 * design. Showing this to a subscriber for one round trip would record demand
 * that never existed and cannot be taken back.
 */
export function ProUpgradeNotice({
  featureKey,
  /** For a COUNT limit: how many they hold, and the ceiling. */
  count,
  limit,
  plan = 'free',
  /** Overrides the generated line. For gates that are not a count. */
  detail,
  /** Analytics source. Defaults to the key, which is almost always right. */
  source,
  className,
}: {
  featureKey: UpgradeKey
  count?: number
  limit?: number
  plan?: PlanTier
  detail?: string
  source?: string
  className?: string
}) {
  const { user } = useAuth()
  const copy = UPGRADE_COPY[featureKey]
  const line = detail ?? countLine(featureKey, plan, count, limit)

  function recordIntent() {
    void captureUpgradeIntent({
      tier: 'pro',
      userId: user?.id ?? null,
      email: user?.email ?? null,
      source: source ?? featureKey,
    }).catch(() => {
      /* signal only — never block the click */
    })
  }

  return (
    <div
      role="note"
      aria-label={copy.title}
      className={
        className ?? 'rounded-2xl border border-brand/25 bg-brand-gradient-soft p-4'
      }
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-brand">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">{copy.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            {copy.why}
            {line ? ` ${line}` : ''}
          </p>
          {/* The sentence that stops a ceiling reading as a threat. Rendered
              from the registry so it cannot be the one card that forgets it. */}
          {copy.reassurance && (
            <p className="mt-1.5 text-xs leading-relaxed text-text-primary/80">
              {copy.reassurance}
            </p>
          )}
          <Link
            to={UPGRADE_ROUTE}
            onClick={recordIntent}
            /* 44px, because this is a real target on a phone and every one of
               the cards it replaces was a bare inline link inside a paragraph. */
            className="focus-ring mt-2 inline-flex min-h-[44px] items-center rounded text-xs font-medium text-accent underline-offset-4 hover:underline"
          >
            {UPGRADE_CTA}
          </Link>
        </div>
      </div>
    </div>
  )
}

/**
 * The sentence that states the arithmetic, and gets it right for somebody who
 * is OVER the ceiling rather than merely at it.
 *
 * The first version of this said "Free includes 3, and you're using all 3" for
 * everyone, which is true at the limit and false above it. Above it is not a
 * hypothetical: a subscriber who cancels keeps every item they made, so a
 * former Pro user can easily be sitting at ten mind maps against a limit of
 * three. Telling that person they are "using all 3" would be both wrong and
 * alarming, since the obvious reading is that seven have gone somewhere.
 */
function countLine(
  featureKey: UpgradeKey,
  plan: PlanTier,
  count?: number,
  limit?: number,
): string | null {
  if (count == null || limit == null || !Number.isFinite(limit)) return null
  if (isGrandfathered({ plan, key: featureKey as LimitKey, count })) {
    return `You have ${count}, which is more than the ${limit} a free plan makes. Every one of them is still here.`
  }
  return `Free includes ${limit}, and you are using all ${limit}.`
}
