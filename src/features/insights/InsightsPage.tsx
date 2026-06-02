import { BarChart3 } from 'lucide-react'
import { PagePlaceholder } from '@/components/common/PagePlaceholder'

export function InsightsPage() {
  return (
    <PagePlaceholder
      icon={BarChart3}
      title="Insights"
      description="See where your time and effort actually go."
      hint="Planned-vs-actual effort, roll-over patterns, and focus trends arrive in V1."
    />
  )
}
