import { useMemo } from 'react'
import { Zap } from 'lucide-react'
import { Card } from '@/components/ui'
import type { FocusSession, Task } from '@/types/database'
import { POINT_LEVELS, computePoints } from '../points'

/**
 * The points breakdown, on Insights.
 *
 * It shows exactly WHERE the number on Today came from, because a score you
 * cannot audit is a slot machine. Same function, same inputs, same window — the
 * chip and this panel are two views of one computation and cannot disagree.
 *
 * There is no chart. Three rows and a bar is the whole story, and a graph here
 * would imply a trend the rolling window does not claim to show.
 */
export function PointsPanel({
  tasks,
  sessions,
  today,
}: {
  tasks: Task[]
  sessions: FocusSession[]
  today: string
}) {
  const points = useMemo(
    () => computePoints({ tasks, sessions, todayStr: today }),
    [tasks, sessions, today],
  )

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
          <Zap className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold">Points</h3>
          <p className="text-sm text-text-muted">
            The last {points.windowDays} days · {points.level.label}
          </p>
        </div>
        <p className="shrink-0 font-mono text-2xl font-semibold text-text-primary">
          {points.total}
        </p>
      </div>

      {points.sources.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nothing yet this week. Finish a task or run a focus session and it&rsquo;ll show up here.
          There&rsquo;s no penalty for a quiet week.
        </p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {points.sources.map((s) => {
              const share = points.total > 0 ? (s.points / points.total) * 100 : 0
              return (
                <li key={s.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-text-primary">{s.label}</span>
                    <span className="shrink-0 font-mono text-text-muted">
                      {s.detail} · {s.points}
                    </span>
                  </div>
                  <div
                    className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(share)}
                    aria-label={`${s.label}: ${s.points} points`}
                  >
                    <div
                      className="h-full rounded-full bg-brand-gradient"
                      style={{ width: `${Math.max(2, Math.round(share))}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>

          {points.toNextLevel !== null && (
            <p className="mt-4 text-xs text-text-muted">
              {points.toNextLevel} more this week would read as &ldquo;
              {nextLabel(points.total)}&rdquo;. Nothing happens if it doesn&rsquo;t, because the
              score resets with the window either way.
            </p>
          )}
        </>
      )}
    </Card>
  )
}

/** The label of the band above `total`, for the "what's next" line. */
function nextLabel(total: number): string {
  return POINT_LEVELS.find((l) => total < l.min)?.label ?? ''
}
