import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge, Card, CardContent } from '@/components/ui'
import { InterestCard } from './InterestCard'
import type { WellnessModule } from '../modules'

/**
 * A Focus & Calm hub card. Live modules render an "Open" link to their route;
 * not-yet-built modules fall back to the existing fake-door InterestCard so we
 * keep measuring demand for what isn't built.
 */
export function ModuleCard({ module }: { module: WellnessModule }) {
  const { icon: Icon, title, description, status, to, intentKey } = module

  if (status !== 'live' || !to) {
    if (intentKey) {
      return <InterestCard concept={{ key: intentKey, title, description, icon: Icon }} source="wellness" />
    }
    return null
  }

  return (
    <Link to={to} className="focus-ring group block h-full rounded-2xl" aria-label={`Open ${title}`}>
      <Card className="h-full transition-colors hover:bg-surface-2/40">
        <CardContent className="flex h-full flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <Badge variant="success">Live</Badge>
          </div>
          <h3 className="font-display text-base font-semibold">{title}</h3>
          <p className="text-sm text-text-muted">{description}</p>
          <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium text-brand">
            Open
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </CardContent>
      </Card>
    </Link>
  )
}
