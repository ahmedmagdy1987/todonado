import { Inbox } from 'lucide-react'
import { PagePlaceholder } from '@/components/common/PagePlaceholder'

export function InboxPage() {
  return (
    <PagePlaceholder
      icon={Inbox}
      title="Inbox"
      description="Capture everything — triage it later."
      hint="Frictionless capture lands here in the MVP: dump a thought, tag effort, schedule when ready."
    />
  )
}
