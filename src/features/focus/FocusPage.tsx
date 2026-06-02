import { Timer } from 'lucide-react'
import { PagePlaceholder } from '@/components/common/PagePlaceholder'

export function FocusPage() {
  return (
    <PagePlaceholder
      icon={Timer}
      title="Focus"
      description="Execute with focus — protect your deep work."
      hint="A focus timer that draws from your planned day arrives in V1."
    />
  )
}
