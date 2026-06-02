import { useState } from 'react'
import { ArrowRight, Check, X } from 'lucide-react'
import { Button, Card, Input } from '@/components/ui'
import { Logo } from '@/components/brand/Logo'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import { useTaskMutations } from '@/features/tasks/api/useTaskMutations'
import { useUpdateCapacity } from '@/features/workspace/api/useUpdateCapacity'
import { QuickAdd } from '@/features/tasks/components/QuickAdd'
import { CapacityMeter } from '@/features/today/CapacityMeter'
import { computeCapacity, sumEffort } from '@/features/today/capacity'
import { selectToday } from '@/features/tasks/selectors'
import { todayISO } from '@/lib/date'
import { formatMinutes } from '@/lib/format'
import { useToast } from '@/components/common/toast-context'
import { cn } from '@/lib/utils'
import { useCompleteOnboarding } from './api/useCompleteOnboarding'

const CAPACITY_PRESETS = [
  { label: '4h', minutes: 240 },
  { label: '6h', minutes: 360 },
  { label: '8h', minutes: 480 },
]
const TOTAL_STEPS = 4

/**
 * First-run activation flow. A short, skippable guided wrapper around existing
 * features (capacity setting, quick-add capture, scheduling) that lands a new
 * user on a planned Today with a live capacity meter. Gated by
 * profile.onboarding_completed; finishing OR skipping marks it complete forever.
 */
export function OnboardingOverlay() {
  const { workspaceId, capacityMinutes } = useWorkspace()
  const { data: tasks = [] } = useTasks(workspaceId)
  const { createTask, updateTask } = useTaskMutations(workspaceId)
  const updateCapacity = useUpdateCapacity()
  const completeOnboarding = useCompleteOnboarding()
  const toast = useToast()

  const [step, setStep] = useState(1)
  const [createdIds, setCreatedIds] = useState<string[]>([])
  const [customHours, setCustomHours] = useState('')

  const today = todayISO()
  const captured = tasks.filter((t) => createdIds.includes(t.id))
  const todayTasks = selectToday(tasks, today)
  const planned = sumEffort(
    todayTasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled'),
  )
  const summary = computeCapacity(planned, capacityMinutes)

  function skip() {
    completeOnboarding.mutate()
  }
  function finish() {
    completeOnboarding.mutate()
    toast.show('Tip: hit Focus on a task to lock in. One task at a time.')
  }
  function setCapacity(minutes: number) {
    updateCapacity.mutate(Math.max(1, Math.round(minutes)))
  }
  async function addTask(value: {
    title: string
    effort_minutes: number | null
    due_date: string | null
  }) {
    const row = await createTask.mutateAsync({
      workspace_id: workspaceId,
      title: value.title,
      effort_minutes: value.effort_minutes,
    })
    setCreatedIds((prev) => [...prev, row.id])
  }
  function goToPlan() {
    // Schedule the captured tasks to today so the meter fills as the aha moment.
    captured.forEach((t) => {
      if (t.scheduled_for !== today) {
        updateTask.mutate({ id: t.id, patch: { scheduled_for: today } })
      }
    })
    setStep(4)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(108,92,231,0.18) 0%, rgba(78,168,255,0.07) 35%, transparent 70%)',
        }}
      />
      <div className="relative z-10 w-full max-w-lg animate-fade-in">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5" aria-label={`Step ${step} of ${TOTAL_STEPS}`}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i + 1 === step ? 'w-6 bg-brand' : i + 1 < step ? 'w-3 bg-brand/50' : 'w-3 bg-surface-2',
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={skip}
            className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-text-muted hover:text-text-primary"
          >
            Skip <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <Card className="p-6 shadow-elevation-lg">
          {step === 1 && (
            <div className="space-y-5 text-center">
              <div className="flex justify-center">
                <Logo showWordmark={false} iconClassName="h-12 w-12" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold">Take control of the day.</h2>
                <p className="mt-2 text-text-muted">
                  Capture what matters, plan what fits, and finish with clarity.
                </p>
              </div>
              <Button size="lg" className="w-full" onClick={() => setStep(2)}>
                Start planning today <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold">
                  How many focused hours do you have on a typical day?
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  This powers your capacity meter, so your plan stays realistic.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {CAPACITY_PRESETS.map((p) => (
                  <button
                    key={p.minutes}
                    type="button"
                    onClick={() => {
                      setCustomHours('')
                      setCapacity(p.minutes)
                    }}
                    className={cn(
                      'focus-ring flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
                      capacityMinutes === p.minutes
                        ? 'border-transparent bg-brand-gradient text-white'
                        : 'border-white/10 text-text-muted hover:text-text-primary',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-muted">Custom</span>
                <Input
                  type="number"
                  min={1}
                  step={0.5}
                  placeholder="hours"
                  value={customHours}
                  onChange={(e) => {
                    setCustomHours(e.target.value)
                    const h = Number(e.target.value)
                    if (Number.isFinite(h) && h > 0) setCapacity(Math.round(h * 60))
                  }}
                  className="w-24"
                  aria-label="Custom daily hours"
                />
                <span className="text-sm text-text-muted">
                  hours · currently {formatMinutes(capacityMinutes)}
                </span>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setStep(3)}>
                  Continue <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold">What&rsquo;s on your plate?</h2>
                <p className="mt-1 text-sm text-text-muted">
                  Add a few things you want to get done. Effort is optional.
                </p>
              </div>
              <QuickAdd autoFocus placeholder="Add a task… (press Enter)" onAdd={addTask} />
              {captured.length > 0 && (
                <ul className="space-y-1">
                  {captured.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center gap-2 rounded-lg bg-surface-2/40 px-3 py-2 text-sm"
                    >
                      <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-text-primary">{t.title}</span>
                      {t.effort_minutes ? (
                        <span className="font-mono text-xs text-text-muted">
                          {formatMinutes(t.effort_minutes)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">
                  {captured.length} added
                </span>
                <Button onClick={goToPlan}>
                  {captured.length > 0 ? 'Plan my day' : 'Continue'}{' '}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold">Plan today</h2>
                <p className="mt-1 text-sm text-text-muted">
                  Adjust effort and watch your day fill up. Keep it realistic.
                </p>
              </div>
              <CapacityMeter summary={summary} onCapacityChange={(m) => updateCapacity.mutate(m)} />
              {captured.length > 0 ? (
                <ul className="space-y-1">
                  {captured.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                      <span className="min-w-0 flex-1 truncate text-text-primary">{t.title}</span>
                      <Input
                        type="number"
                        min={0}
                        step={5}
                        placeholder="min"
                        defaultValue={t.effort_minutes ?? ''}
                        onChange={(e) => {
                          const v = e.target.value
                          const n = Number(v)
                          updateTask.mutate({
                            id: t.id,
                            patch: {
                              effort_minutes:
                                v === '' || !Number.isFinite(n) ? null : Math.max(0, Math.round(n)),
                            },
                          })
                        }}
                        className="h-9 w-20"
                        aria-label={`Effort for ${t.title}`}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted">
                  No tasks yet — that&rsquo;s okay. You can capture them anytime from your day.
                </p>
              )}
              <Button size="lg" className="w-full" onClick={finish}>
                Finish — go to my day <Check className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
