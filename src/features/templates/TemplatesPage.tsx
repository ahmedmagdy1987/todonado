import { useMemo, useState } from 'react'
import { LayoutTemplate, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { TEMPLATES, TEMPLATE_CATEGORIES } from './catalog'
import { resolveTemplateIcon } from './icons'
import { filterTemplates } from './browse'
import { TemplateCard } from './components/TemplateCard'

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
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">Templates</h2>
          <p className="text-sm text-text-muted">
            Start from a ready-made list — every task comes effort-tagged.
          </p>
        </div>
      </header>

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
    </div>
  )
}
