import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowLeft, BookmarkPlus, Pencil, Plus } from 'lucide-react'
import { Button, Card, CardContent, Input } from '@/components/ui'
import { SortableList } from '@/components/common/SortableList'
import { newPositionForMove } from '@/lib/reorder'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import { selectByProject } from '@/features/tasks/selectors'
import { FREE_PERSONAL_TEMPLATES } from '@/lib/config'
import { useToast } from '@/components/common/toast-context'
import { usePlan } from '@/features/billing/usePlan'
import { useUserTemplates } from '@/features/templates/api/useUserTemplates'
import {
  canCreatePersonalTemplate,
  captureProjectAsTemplate,
  toUserTemplateTasks,
} from '@/features/templates/personal'
import { PersonalLimitUpsell } from '@/features/templates/components/PersonalLimitUpsell'
import { windowTaskHistory } from '@/features/history/historyWindow'
import { useHistoryWindow } from '@/features/history/useHistoryWindow'
import { HistoryCutoffCard } from '@/features/history/components/HistoryCutoffCard'
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
  const { createSection, renameSection, deleteSection, reorderSection } =
    useSectionMutations(projectId)
  const { updateProject, archiveProject } = useProjectMutations(workspaceId)
  const { cutoffDay, days: historyDays } = useHistoryWindow()

  const [newSection, setNewSection] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [showTemplateLimit, setShowTemplateLimit] = useState(false)
  const toast = useToast()
  const { isPro } = usePlan()
  const {
    templates: personalRows,
    available: personalTemplatesAvailable,
    createTemplate,
  } = useUserTemplates()
  const canSaveTemplate = canCreatePersonalTemplate(
    personalRows.length,
    isPro,
    FREE_PERSONAL_TEMPLATES,
  )

  const project = projects.find((p) => p.id === projectId)

  if (!project) {
    return (
      <div className="animate-fade-in space-y-6">
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

  // A project list is the app's completed-task history: selectByProject keeps
  // `done` tasks so past work stays in context. On a limited plan we window that
  // history — COMPLETED tasks older than the window drop out of the view, while
  // every OPEN task stays put no matter how old it is (windowTaskHistory
  // guarantees that). Nothing is deleted; `tasks` still holds it all, which is
  // why upgrading shows everything on the next render.
  const allProjectTasks = selectByProject(tasks, projectId)
  const { visible: projectTasks, hiddenCount } = windowTaskHistory(allProjectTasks, cutoffDay)
  const unsectioned = projectTasks.filter((t) => t.section_id == null)
  const sectionIds = sections.map((s) => s.id)

  function addSection(e: FormEvent) {
    e.preventDefault()
    const trimmed = newSection.trim()
    if (!trimmed) return
    createSection.mutate({ project_id: projectId, name: trimmed, position: sections.length })
    setNewSection('')
  }

  /**
   * THE zero-typing capture: this project's open tasks — with their sections,
   * order, efforts and notes — become a reusable personal template. Uses the
   * UNWINDOWED list so nothing depends on the history view (it only ever hides
   * completed work, which a template excludes anyway).
   */
  function saveAsTemplate() {
    if (!project || createTemplate.isPending) return
    if (!canSaveTemplate) {
      setShowTemplateLimit(true)
      return
    }
    const draft = captureProjectAsTemplate({ project, sections, tasks: allProjectTasks })
    if (draft.tasks.length === 0) {
      toast.show('Add an open task first — a template needs something to apply.')
      return
    }
    createTemplate.mutate(
      {
        title: draft.title,
        description: draft.description,
        icon: draft.icon,
        color: draft.color,
        tasks: toUserTemplateTasks(draft.tasks),
      },
      {
        onSuccess: () => toast.show(`Saved “${draft.title}” to My templates`),
        onError: () => toast.show('Couldn’t save that template — please try again.'),
      },
    )
  }

  function commitName() {
    const trimmed = nameDraft.trim()
    if (trimmed) updateProject.mutate({ id: projectId, patch: { name: trimmed } })
    setEditingName(false)
  }

  return (
    <div className="animate-fade-in space-y-6">
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
            className="focus-ring group flex min-w-0 flex-1 items-center gap-2 rounded text-left"
          >
            <h2 className="truncate font-display text-2xl font-bold tracking-tight">{project.name}</h2>
            <Pencil className="h-4 w-4 shrink-0 text-text-muted opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100" aria-hidden />
          </button>
        )}
        {personalTemplatesAvailable && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={saveAsTemplate}
            loading={createTemplate.isPending}
          >
            <BookmarkPlus className="h-4 w-4" aria-hidden /> Save as template
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className={personalTemplatesAvailable ? undefined : 'ml-auto'}
          onClick={() => {
            archiveProject.mutate({ id: projectId, archived: true })
            navigate('/projects')
          }}
        >
          <Archive className="h-4 w-4" aria-hidden /> Archive
        </Button>
      </header>

      {showTemplateLimit && !canSaveTemplate && (
        <PersonalLimitUpsell limit={FREE_PERSONAL_TEMPLATES} />
      )}

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
          onReorder={(ordered, activeId) => {
            const positionById = new Map(sections.map((s) => [s.id, s.position]))
            reorderSection.mutate({
              id: activeId,
              position: newPositionForMove(ordered, activeId, positionById),
            })
          }}
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

      {/* Quiet end-of-history marker. Renders nothing at all when the window
          withheld nothing — so a user in their first two weeks never sees it. */}
      <HistoryCutoffCard hiddenCount={hiddenCount} days={historyDays} />

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
