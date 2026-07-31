import { useMemo } from 'react'
import { BarChart3, Sparkles } from 'lucide-react'
import { Badge, Card, CardContent } from '@/components/ui'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import { useFocusSessions } from '@/features/focus/api/useFocusSessions'
import { usePlan } from '@/features/billing/usePlan'
import { PointsPanel } from '@/features/points/components/PointsPanel'
import { FEATURES } from '@/lib/config'
import { todayISO } from '@/lib/date'
import { computeInsights } from './insights'
import { computeWeeklyReview } from './weeklyReview'
import { InsightsDashboard } from './components/InsightsDashboard'
import { InsightsTeaser } from './components/InsightsTeaser'

function InsightsHeader({ isPro }: { isPro: boolean }) {
  return (
    <header className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
        <BarChart3 className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-semibold">Insights</h2>
          <Badge variant={isPro ? 'brand' : 'outline'}>Pro</Badge>
        </div>
        <p className="text-sm text-text-muted">See where your time and effort actually go.</p>
      </div>
    </header>
  )
}

function InsightsEmpty({ windowDays }: { windowDays: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <Sparkles className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <h3 className="font-display text-xl font-semibold">Your insights are taking shape</h3>
          <p className="mx-auto mt-1 max-w-sm text-text-muted">
            Plan a few days with effort estimates and run some focus sessions. Your trends from the
            last {windowDays} days will show up here as you go.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function InsightsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-white/5 bg-surface-2/40"
          />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-2xl border border-white/5 bg-surface" />
      <div className="h-56 animate-pulse rounded-2xl border border-white/5 bg-surface" />
    </div>
  )
}

export function InsightsPage() {
  // `billingLoading` matters here more than anywhere: without it a paying
  // subscriber sees the blurred teaser and an Upgrade CTA on every cold load,
  // and clicking it writes an `upgrade_intents` row that has no delete policy.
  const { isPro, billingLoading } = usePlan()
  const { workspaceId, capacityMinutes } = useWorkspace()
  const { data: tasks = [], isPending: tasksPending } = useTasks(workspaceId)
  const { data: sessions = [], isPending: focusPending } = useFocusSessions(workspaceId)
  const today = todayISO()

  const data = useMemo(
    () => computeInsights(tasks, sessions, capacityMinutes, today),
    [tasks, sessions, capacityMinutes, today],
  )
  const weekly = useMemo(
    () => computeWeeklyReview(tasks, sessions, capacityMinutes, today),
    [tasks, sessions, capacityMinutes, today],
  )

  // `billingLoading` folded in, so the Pro gate below is never judged before
  // the plan is known.
  const loading = tasksPending || focusPending || billingLoading

  return (
    <div className="animate-fade-in space-y-8">
      <InsightsHeader isPro={isPro} />
      {/* The audit trail for the chip on Today: same function, same inputs, same
          window, so the two can never disagree. Zero extra requests — `tasks`
          and `sessions` are already in hand above. */}
      {isPro && FEATURES.points && !loading && (
        <PointsPanel tasks={tasks} sessions={sessions} today={today} />
      )}
      {/* The skeleton, not the teaser and not nothing: until the plan is known
          we must neither claim the user is Free nor leave the page blank. */}
      {billingLoading ? (
        <InsightsSkeleton />
      ) : !isPro ? (
        <InsightsTeaser />
      ) : loading ? (
        <InsightsSkeleton />
      ) : data.hasData ? (
        <InsightsDashboard data={data} weekly={weekly} />
      ) : (
        <InsightsEmpty windowDays={data.windowDays} />
      )}
    </div>
  )
}
