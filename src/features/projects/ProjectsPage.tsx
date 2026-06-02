import { FolderKanban } from 'lucide-react'
import { PagePlaceholder } from '@/components/common/PagePlaceholder'

export function ProjectsPage() {
  return (
    <PagePlaceholder
      icon={FolderKanban}
      title="Projects"
      description="Organize work into projects and sections."
      hint="Projects, sections, and task organization are modeled in the schema and arrive in the MVP."
    />
  )
}
