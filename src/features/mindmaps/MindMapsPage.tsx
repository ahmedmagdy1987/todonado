import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Network, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Button, Card, CardContent } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { usePlan } from '@/features/billing/usePlan'
import { captureUpgradeIntent } from '@/features/marketing/api/upgradeIntents'
import { FREE_MIND_MAPS } from '@/lib/config'
import { emptyGraph } from './graph'
import { useMindMapMutations, useMindMaps } from './api/useMindMaps'
import { capDecision } from '@/features/billing/gate'

/**
 * The list of maps.
 *
 * Deliberately thin: it fetches titles only (the graph columns are the big ones)
 * and the interesting code all lives one route deeper, in the editor.
 */
export function MindMapsPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const { isPro, billingLoading } = usePlan()
  const navigate = useNavigate()

  const { data, isPending } = useMindMaps(userId)
  const { createMap, deleteMap } = useMindMapMutations(userId)

  const maps = useMemo(() => data?.rows ?? [], [data])
  /** False ONLY when the table is absent (migration pending). */
  const available = data?.available ?? true
  const [showLimit, setShowLimit] = useState(false)

  // An in-flight create occupies a slot: createMap is awaited (not optimistic),
  // so for one round trip `maps` does not include it yet and the Free cap is
  // client-side only. Without this a fast second tap makes a second map.
  const pending = createMap.isPending ? 1 : 0

  /**
   * UNTIL THE LIST HAS LOADED, THE COUNT IS ZERO AND EVERY CAP LOOKS SATISFIED
   * — and until BILLING has loaded, every subscriber looks Free.
   *
   * Neither is hypothetical. The first shipped: with the migration applied, the
   * E2E tapped "New map" on a freshly-opened list and got a SECOND map on a
   * one-map plan, because `maps` was still `[]`. The second was the same
   * mistake with the other input — `countKnown` folded this list and never the
   * plan, so a Pro user with one map was told, on every cold load, that they
   * had hit a limit they had paid to remove. A cap computed from data that has
   * not arrived is not a cap, whichever half is missing.
   */
  const decision = capDecision({
    planKnown: !billingLoading,
    countKnown: !isPending,
    isPro,
    count: maps.length + pending,
    limit: FREE_MIND_MAPS,
  })
  const ready = decision !== 'unknown'

  function create() {
    if (!ready) return
    if (decision === 'capped') {
      setShowLimit(true)
      return
    }
    setShowLimit(false)
    const graph = emptyGraph('Start here')
    createMap.mutate(
      { title: 'Untitled map', nodes: graph.nodes, edges: graph.edges },
      { onSuccess: (row) => navigate(`/vision/maps/${row.id}`) },
    )
  }

  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
            <Network className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold">Mind maps</h2>
            <p className="text-sm text-text-muted">
              Think it out before it becomes a list — ideas you can move around and join up.
            </p>
          </div>
        </div>
        {available && (
          <Button
            onClick={create}
            disabled={createMap.isPending || !ready}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden /> New map
          </Button>
        )}
      </header>

      {showLimit && decision === 'capped' && <MapLimitUpsell limit={FREE_MIND_MAPS} />}

      {!available ? (
        <NotSwitchedOnCard />
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-white/5 bg-surface-2/40" />
          ))}
        </div>
      ) : maps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
              <Network className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h3 className="font-display text-lg font-semibold">Nothing mapped yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-text-muted">
                Start with one thought in the middle and branch out. You can link any idea to the
                project or task it turns into.
              </p>
            </div>
            <Button onClick={create} disabled={createMap.isPending}>
              <Plus className="h-4 w-4" aria-hidden /> Draw your first map
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-3">
          {maps.map((map) => (
            <li key={map.id}>
              <div className="group relative h-full rounded-2xl border border-white/5 bg-surface/60 transition-colors hover:border-brand/25">
                <Link
                  to={`/vision/maps/${map.id}`}
                  className="focus-ring flex h-full flex-col gap-2 rounded-2xl p-5"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
                    <Network className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="mt-1 truncate font-display text-base font-semibold">
                    {map.title}
                  </span>
                  <span className="font-mono text-[11px] text-text-muted">
                    edited {relativeDay(map.updated_at)}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => deleteMap.mutate(map.id)}
                  aria-label={`Delete ${map.title}`}
                  className="tap-44 focus-ring absolute right-3 top-3 rounded-lg p-2 text-text-muted opacity-100 transition-opacity hover:text-danger focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * "3 days ago" without pulling a formatter in. Whole days only — the exact
 * minute a map was last touched is not information anyone acts on.
 */
function relativeDay(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return 'recently'
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(iso).toLocaleDateString()
}

function MapLimitUpsell({ limit }: { limit: number }) {
  const { user } = useAuth()

  function recordIntent() {
    void captureUpgradeIntent({
      tier: 'pro',
      userId: user?.id ?? null,
      email: user?.email ?? null,
      source: 'mindmap_limit',
    }).catch(() => {
      /* signal only — never block the click */
    })
  }

  return (
    <div
      role="note"
      aria-label="Mind map limit reached"
      className="rounded-2xl border border-brand/25 bg-brand-gradient-soft p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-brand">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {limit === 1 ? 'One map on Free' : `${limit} maps on Free`} — Pro keeps it unlimited
          </p>
          <p className="mt-1 leading-relaxed text-xs text-text-muted">
            The map you have holds 200 ideas and keeps working exactly as it is; this only limits
            starting another.{' '}
            <Link
              to="/settings/plan"
              onClick={recordIntent}
              className="focus-ring rounded text-accent underline-offset-4 hover:underline"
            >
              Upgrade
            </Link>{' '}
            for as many as you need.
          </p>
        </div>
      </div>
    </div>
  )
}

/** The honest state when `mind_maps` does not exist yet. */
function NotSwitchedOnCard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <h3 className="font-display text-lg font-semibold">Not switched on yet</h3>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-text-muted">
          Mind maps are built and waiting on a database migration. Nothing is missing from your
          account — this page will start working the moment it is applied.
        </p>
      </CardContent>
    </Card>
  )
}
