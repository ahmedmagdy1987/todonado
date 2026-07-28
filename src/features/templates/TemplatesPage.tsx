import { useMemo, useState } from 'react'
import { LayoutTemplate, Plus, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button, Card, CardContent, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { FREE_PERSONAL_TEMPLATES } from '@/lib/config'
import { useToast } from '@/components/common/toast-context'
import { usePlan } from '@/features/billing/usePlan'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { TEMPLATES, TEMPLATE_CATEGORIES } from './catalog'
import { resolveTemplateIcon } from './icons'
import { filterTemplates } from './browse'
import { TemplateCard } from './components/TemplateCard'
import { PersonalTemplateEditor } from './components/PersonalTemplateEditor'
import { PersonalLimitUpsell } from './components/PersonalLimitUpsell'
import { useUserTemplates } from './api/useUserTemplates'
import {
  canCreatePersonalTemplate,
  personalToTemplate,
  toUserTemplateTasks,
  type PersonalTemplateDraft,
} from './personal'

interface CatItem {
  id: string
  label: string
  count: number
  Icon: LucideIcon
}

function CategoryChip({ item, active, onClick }: { item: CatItem; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'border-transparent bg-brand-gradient text-white'
          : 'border-white/10 text-text-muted hover:text-text-primary',
      )}
    >
      <item.Icon className="h-3.5 w-3.5" aria-hidden />
      {item.label}
      <span className={cn('font-mono text-xs', active ? 'text-white/70' : 'text-text-muted')}>
        {item.count}
      </span>
    </button>
  )
}

export function TemplatesPage() {
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showLimit, setShowLimit] = useState(false)
  const { isPro } = usePlan()
  const { workspaceId } = useWorkspace()
  const {
    templates: personalRows,
    available: personalAvailable,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  } = useUserTemplates()
  const toast = useToast()

  // One adaptation at the boundary — from here on a personal template IS a
  // Template, so the card, search and preview below are the shared code path.
  const personal = useMemo(() => personalRows.map(personalToTemplate), [personalRows])
  const personalResults = useMemo(
    () => filterTemplates(personal, category, query),
    [personal, category, query],
  )
  const canCreate = canCreatePersonalTemplate(personalRows.length, isPro, FREE_PERSONAL_TEMPLATES)

  const editing = editingId ? personalRows.find((r) => r.id === editingId) : undefined
  const editingDraft: PersonalTemplateDraft | undefined = editing
    ? {
        title: editing.title,
        description: editing.description,
        icon: editing.icon,
        color: editing.color,
        tasks: personalToTemplate(editing).tasks,
      }
    : undefined

  function startNew() {
    // The limit gates CREATION only — never viewing or applying what exists.
    if (!canCreate) {
      setShowLimit(true)
      return
    }
    setShowLimit(false)
    setEditingId(null)
    setEditorOpen(true)
  }

  function startEdit(id: string) {
    setShowLimit(false)
    setEditingId(id)
    setEditorOpen(true)
  }

  function closeEditor() {
    setEditorOpen(false)
    setEditingId(null)
  }

  function save(draft: PersonalTemplateDraft) {
    const payload = {
      title: draft.title.trim(),
      description: draft.description,
      icon: draft.icon,
      color: draft.color,
      tasks: toUserTemplateTasks(draft.tasks),
    }
    const onError = () => toast.show('Couldn’t save that template — please try again.')

    if (editingId) {
      updateTemplate.mutate(
        { id: editingId, patch: payload },
        {
          onSuccess: () => {
            closeEditor()
            toast.show('Template updated')
          },
          onError,
        },
      )
      return
    }
    createTemplate.mutate(payload, {
      onSuccess: () => {
        closeEditor()
        toast.show('Template saved')
      },
      onError,
    })
  }

  function remove() {
    if (!editingId) return
    deleteTemplate.mutate(editingId, {
      onSuccess: () => {
        closeEditor()
        toast.show('Template deleted')
      },
      onError: () => toast.show('Couldn’t delete that template — please try again.'),
    })
  }

  const cats: CatItem[] = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of TEMPLATES) counts.set(t.category, (counts.get(t.category) ?? 0) + 1)
    return [
      { id: 'all', label: 'All templates', count: TEMPLATES.length, Icon: LayoutTemplate },
      ...TEMPLATE_CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        count: counts.get(c.id) ?? 0,
        Icon: resolveTemplateIcon(c.icon),
      })),
    ]
  }, [])

  const results = useMemo(() => filterTemplates(TEMPLATES, category, query), [category, query])

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <LayoutTemplate className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-semibold">Templates</h2>
          <p className="text-sm text-text-muted">
            Start from a ready-made list — every task comes effort-tagged.
          </p>
        </div>
        {personalAvailable && (
          <Button type="button" variant="secondary" size="sm" onClick={startNew} className="shrink-0">
            <Plus className="h-4 w-4" aria-hidden /> New template
          </Button>
        )}
      </header>

      {showLimit && !canCreate && <PersonalLimitUpsell limit={FREE_PERSONAL_TEMPLATES} />}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates…"
          aria-label="Search templates"
          className="pl-9"
        />
      </div>

      {/* Mobile: scrollable category chips */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:hidden" aria-label="Template categories">
        {cats.map((c) => (
          <CategoryChip key={c.id} item={c} active={c.id === category} onClick={() => setCategory(c.id)} />
        ))}
      </div>

      <div className="md:grid md:grid-cols-[200px_1fr] md:gap-6">
        {/* Desktop: category sidebar */}
        <nav className="hidden md:block" aria-label="Template categories">
          <ul className="space-y-1">
            {cats.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setCategory(c.id)}
                  aria-pressed={c.id === category}
                  className={cn(
                    'focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors',
                    c.id === category
                      ? 'bg-brand-gradient-soft text-text-primary'
                      : 'text-text-muted hover:bg-surface-2/60 hover:text-text-primary',
                  )}
                >
                  <c.Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-left">{c.label}</span>
                  <span className="font-mono text-xs text-text-muted">{c.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Results */}
        <div className="mt-2 md:mt-0">
          {/* My templates — only when they have any that match the current filter. */}
          {personalResults.length > 0 && (
            <section aria-labelledby="my-templates" className="mb-8">
              <div className="mb-3 flex items-center gap-2">
                <h3 id="my-templates" className="font-display text-base font-semibold">
                  My templates
                </h3>
                <span className="font-mono text-xs text-text-muted">{personalResults.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {personalResults.map((t) => (
                  <TemplateCard key={t.id} template={t} personal onEdit={() => startEdit(t.id)} />
                ))}
              </div>
            </section>
          )}

          <p className="sr-only" role="status" aria-live="polite">
            {results.length} {results.length === 1 ? 'template' : 'templates'}
          </p>
          {results.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <Search className="h-8 w-8 text-text-muted/40" aria-hidden />
                <p className="font-medium text-text-primary">No templates found</p>
                <p className="max-w-sm text-sm text-text-muted">Try a different search or category.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((t) => (
                <TemplateCard key={t.id} template={t} />
              ))}
            </div>
          )}
        </div>
      </div>

      <PersonalTemplateEditor
        open={editorOpen}
        workspaceId={workspaceId}
        initial={editingDraft}
        title={editingId ? 'Edit template' : 'New template'}
        saving={createTemplate.isPending || updateTemplate.isPending}
        onCancel={closeEditor}
        onSave={save}
        onDelete={editingId ? remove : undefined}
      />
    </div>
  )
}
