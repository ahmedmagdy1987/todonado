import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Crown, ExternalLink, Loader2, Sparkles } from 'lucide-react'
import { Badge, Button, Card } from '@/components/ui'
import { useToast } from '@/components/common/toast-context'
import { usePlan } from '@/features/billing/usePlan'
import { isBillingConfigured, priceIdFor, type BillingInterval } from '@/features/billing/stripeConfig'
import { openBillingPortal, startCheckout } from '@/features/billing/api/checkout'
import { PLANS } from '@/features/marketing/plans'
import { FREE_HISTORY_DAYS } from '@/lib/config'
import { UpgradeIntentModal } from '@/features/marketing/components/UpgradeIntentModal'

const PRO_PLAN = PLANS.find((p) => p.id === 'pro') ?? null
const PRO_FEATURES = PRO_PLAN?.features ?? []
// Evaluated once at module load: real Stripe checkout vs the fake-door fallback.
const billingReady = isBillingConfigured()

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return null
  }
}

export function PlanPage() {
  // `billingLoading` is not cosmetic: without it a paying subscriber is shown
  // the Free badge and two Upgrade buttons for the length of the billing fetch.
  const { isPro, isFounding, billing, billingLoading, refetchBilling } = usePlan()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)
  const [busy, setBusy] = useState<BillingInterval | 'portal' | null>(null)

  const checkoutReturn = params.get('checkout') // 'success' | 'cancel' | null
  const hasRealSubscription = billing?.plan === 'pro'
  // "Activating" only right after a successful checkout, until the webhook flips
  // us to Pro. We never fake-confirm — we poll and wait for the real row.
  const activating = billingReady && checkoutReturn === 'success' && !isPro
  const renewal = formatDate(billing?.current_period_end)

  // Poll for the webhook to land (plan flips), for up to ~40s.
  useEffect(() => {
    if (!activating) return
    const tick = setInterval(() => refetchBilling(), 2500)
    const stop = setTimeout(() => clearInterval(tick), 40_000)
    return () => {
      clearInterval(tick)
      clearTimeout(stop)
    }
  }, [activating, refetchBilling])

  // Tidy the URL once resolved (Pro after success, or a cancel).
  useEffect(() => {
    if (checkoutReturn === 'cancel' || (checkoutReturn === 'success' && isPro)) {
      if (checkoutReturn === 'success' && isPro) {
        toast.show('Welcome to Pro — thanks for your support!')
      }
      const next = new URLSearchParams(params)
      next.delete('checkout')
      setParams(next, { replace: true })
    }
  }, [checkoutReturn, isPro, params, setParams, toast])

  async function doCheckout(interval: BillingInterval) {
    setBusy(interval)
    try {
      await startCheckout(priceIdFor(interval)) // redirects away on success
    } catch (err) {
      setBusy(null)
      toast.show(err instanceof Error ? err.message : 'Could not start checkout — please try again.')
    }
  }

  async function doPortal() {
    setBusy('portal')
    try {
      await openBillingPortal() // redirects away on success
    } catch (err) {
      setBusy(null)
      toast.show(err instanceof Error ? err.message : 'Could not open the billing portal.')
    }
  }

  const label = isFounding ? 'Founding' : isPro ? 'Pro' : 'Free'
  const blurb = isFounding
    ? 'You have full access as a founding member — thank you for being here early.'
    : isPro
      ? 'You have full access to Insights and every Pro feature.'
      : `You are on the Free plan. Everything you need to plan and run your day is included, with completed history for the last ${FREE_HISTORY_DAYS} days.`

  return (
    // Text page: cap at a comfortable reading width, centered in the wider frame.
    <div className="animate-fade-in mx-auto max-w-2xl space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <Crown className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">My Plan</h2>
          <p className="text-sm text-text-muted">Your current plan and what it includes.</p>
        </div>
      </header>

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-display text-lg font-semibold">Current plan</h3>
          {billingLoading ? (
            <span
              className="h-6 w-16 animate-pulse rounded-full bg-surface-2"
              role="status"
              aria-label="Checking your plan"
            />
          ) : (
            <Badge variant={isPro ? 'brand' : 'outline'}>{label}</Badge>
          )}
        </div>
        <p className="mt-2 text-sm text-text-muted">
          {billingLoading ? 'Checking your plan…' : blurb}
        </p>

        <ul className="mt-5 space-y-2.5">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              {isPro ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
              ) : (
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
              )}
              <span className={isPro ? 'text-text-primary/90' : 'text-text-muted'}>{f}</span>
            </li>
          ))}
        </ul>

        {activating ? (
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 p-3 text-sm text-text-primary">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" aria-hidden />
            Activating your subscription… this usually takes a few seconds.
          </div>
        ) : isPro ? (
          <div className="mt-6 space-y-3">
            {hasRealSubscription ? (
              <>
                {(billing?.subscription_status || renewal) && (
                  <p className="text-sm text-text-muted">
                    {billing?.subscription_status ? `Status: ${billing.subscription_status}. ` : ''}
                    {renewal ? `Renews ${renewal}.` : ''}
                  </p>
                )}
                <Button variant="secondary" onClick={doPortal} loading={busy === 'portal'}>
                  <ExternalLink className="h-4 w-4" aria-hidden /> Manage subscription
                </Button>
              </>
            ) : (
              <p className="text-sm text-text-muted">
                {isFounding ? 'Founding member access — no billing needed.' : 'You have Pro access.'}
              </p>
            )}
          </div>
        ) : billingReady ? (
          <div className="mt-6 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={() => doCheckout('monthly')} loading={busy === 'monthly'} disabled={busy !== null}>
                Upgrade — Monthly
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => doCheckout('yearly')}
                loading={busy === 'yearly'}
                disabled={busy !== null}
              >
                Upgrade — Yearly
              </Button>
            </div>
            <p className="text-xs text-text-muted">Secure checkout by Stripe · cancel anytime.</p>
            {checkoutReturn === 'cancel' && (
              <p className="text-xs text-text-muted">Checkout canceled — no charge was made.</p>
            )}
          </div>
        ) : (
          // Fake-door fallback: no Stripe keys configured — unchanged pre-billing behavior.
          <div className="mt-6">
            <Button size="lg" onClick={() => setModalOpen(true)}>
              Upgrade to Pro
            </Button>
            <p className="mt-2 text-xs text-text-muted">
              Nothing is charged yet — this records your interest so we can build Pro for real.
            </p>
          </div>
        )}
      </Card>

      <Link
        to="/settings"
        className="focus-ring -mx-2 inline-flex min-h-[44px] items-center gap-1.5 rounded px-2 text-sm text-text-muted hover:text-text-primary md-fine:mx-0 md-fine:min-h-0 md-fine:px-0"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Settings
      </Link>

      {!billingReady && (
        <UpgradeIntentModal plan={modalOpen ? PRO_PLAN : null} source="my-plan" onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}
