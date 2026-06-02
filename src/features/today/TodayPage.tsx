import type { LucideIcon } from 'lucide-react'
import { format } from 'date-fns'
import { AlertCircle, Clock, ListChecks, Plus } from 'lucide-react'
import { Button, Card, CardContent } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { cn } from '@/lib/utils'
import { CapacityMeter } from './CapacityMeter'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const TINTS = {
  brand: 'text-brand',
  accent: 'text-accent',
  warning: 'text-warning',
} as const

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: LucideIcon
  label: string
  value: string
  tint: keyof typeof TINTS
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2',
            TINTS[tint],
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="font-mono text-xl font-semibold leading-none text-text-primary">
            {value}
          </p>
          <p className="mt-1 text-xs text-text-muted">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function TodayPage() {
  const { user } = useAuth()
  const name = user?.email?.split('@')[0] ?? 'there'

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <header>
        <p className="text-sm text-text-muted">{format(new Date(), 'EEEE, MMMM d')}</p>
        <h2 className="mt-1 font-display text-3xl font-bold tracking-tight">
          Your Command Center
        </h2>
        <p className="mt-1 text-text-muted">
          {getGreeting()}, {name}. Here&rsquo;s your day at a glance.
        </p>
      </header>

      {/* Stat strip (placeholder metrics) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={ListChecks} label="Tasks today" value="—" tint="brand" />
        <StatCard icon={Clock} label="Planned effort" value="—" tint="accent" />
        <StatCard icon={AlertCircle} label="Rolled over" value="—" tint="warning" />
      </div>

      {/* Capacity meter — the core differentiator */}
      <CapacityMeter />

      {/* Empty state */}
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <img
            src="/icons/icon-192.png"
            alt=""
            aria-hidden
            className="h-14 w-14 rounded-2xl opacity-90"
          />
          <div>
            <h3 className="font-display text-xl font-semibold">Your day is clear.</h3>
            <p className="mt-1 text-text-muted">Pull in what matters most.</p>
          </div>
          <Button disabled title="Task capture arrives in the MVP">
            <Plus className="h-4 w-4" aria-hidden />
            Add your first task
          </Button>
          <p className="text-xs text-text-muted/70">
            Capture, effort-tagging, and intelligent roll-over land in the MVP.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
