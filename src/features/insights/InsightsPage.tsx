import { useMemo } from 'react'
import { BarChart3, Sparkles } from 'lucide-react'
import { Badge, Card, CardContent } from '@/components/ui'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import { useFocusSessions } from '@/features/focus/api/useFocusSessions'
import { usePlan } from '@/features/billing/usePlan'
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
  const { isPro } = usePlan()
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

  const loading = tasksPending || focusPending

  return (
    <div className="animate-fade-in space-y-8">
      <InsightsHeader isPro={isPro} />
      {!isPro ? (
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
