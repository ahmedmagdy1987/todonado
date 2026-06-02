import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowLeft, Pencil, Plus } from 'lucide-react'
import { Button, Card, CardContent, Input } from '@/components/ui'
import { SortableList } from '@/components/common/SortableList'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import { selectByProject } from '@/features/tasks/selectors'
import { useProjects, useProjectMutations } from './api/useProjects'
import { useSections, useSectionMutations } from './api/useSections'
import { SectionGroup } from './components/SectionGroup'

export function ProjectDetailPage() {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const { workspaceId } = useWorkspace()
  const { data: projects = [], isPending: projectsPending } = useProjects(workspaceId)
  const { data: tasks = [] } = useTasks(workspaceId)
  const { data: sections = [] } = useSections(projectId)
  const { createSection, renameSection, deleteSection, reorderSections } =
    useSectionMutations(projectId)
  const { updateProject, archiveProject } = useProjectMutations(workspaceId)

  const [newSection, setNewSection] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const project = projects.find((p) => p.id === projectId)

  if (!project) {
    return (
      <div className="animate-fade-in space-y-4">
        <Link
          to="/projects"
          className="focus-ring inline-flex items-center gap-1 rounded text-sm text-text-muted hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Projects
        </Link>
        <Card>
          <CardContent className="py-14 text-center text-text-muted">
            {projectsPending ? 'Loading project…' : 'Project not found.'}
          </CardContent>
        </Card>
      </div>
    )
  }

  const projectTasks = selectByProject(tasks, projectId)
  const unsectioned = projectTasks.filter((t) => t.section_id == null)
  const sectionIds = sections.map((s) => s.id)

  function addSection(e: FormEvent) {
    e.preventDefault()
    const trimmed = newSection.trim()
    if (!trimmed) return
    createSection.mutate({ project_id: projectId, name: trimmed, position: sections.length })
    setNewSection('')
  }

  function commitName() {
    const trimmed = nameDraft.trim()
    if (trimmed) updateProject.mutate({ id: projectId, patch: { name: trimmed } })
    setEditingName(false)
  }

  return (
    <div className="animate-fade-in space-y-5">
      <Link
        to="/projects"
        className="focus-ring inline-flex items-center gap-1 rounded text-sm text-text-muted hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Projects
      </Link>

      <header className="flex items-center gap-3">
        <span
          className="h-4 w-4 shrink-0 rounded-full"
          style={{ backgroundColor: project.color }}
        />
        {editingName ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              commitName()
            }}
            className="flex-1"
          >
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              autoFocus
              className="h-9 max-w-sm font-display text-lg"
              aria-label="Project name"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setNameDraft(project.name)
              setEditingName(true)
            }}
            className="focus-ring group inline-flex items-center gap-2 rounded text-left"
          >
            <h2 className="font-display text-2xl font-bold tracking-tight">{project.name}</h2>
            <Pencil className="h-4 w-4 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
          </button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => {
            archiveProject.mutate({ id: projectId, archived: true })
            navigate('/projects')
          }}
        >
          <Archive className="h-4 w-4" aria-hidden /> Archive
        </Button>
      </header>

      <SectionGroup
        workspaceId={workspaceId}
        projectId={projectId}
        sectionId={null}
        title={sections.length > 0 ? 'No section' : 'Tasks'}
        tasks={unsectioned}
      />

      {sectionIds.length > 0 && (
        <SortableList
          ids={sectionIds}
          onReorder={(ordered) => reorderSections.mutate(ordered)}
          className="space-y-4"
        >
          {(id) => {
            const section = sections.find((s) => s.id === id)
            if (!section) return null
            const sectionTasks = projectTasks.filter((t) => t.section_id === section.id)
            return (
              <SectionGroup
                workspaceId={workspaceId}
                projectId={projectId}
                sectionId={section.id}
                title={section.name}
                tasks={sectionTasks}
                onRename={(name) => renameSection.mutate({ id: section.id, name })}
                onDelete={() => deleteSection.mutate(section.id)}
              />
            )
          }}
        </SortableList>
      )}

      <form onSubmit={addSection} className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-text-muted" aria-hidden />
        <Input
          value={newSection}
          onChange={(e) => setNewSection(e.target.value)}
          placeholder="Add a section…"
          className="max-w-xs"
          aria-label="New section name"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={!newSection.trim()}>
          Add section
        </Button>
      </form>
    </div>
  )
}
