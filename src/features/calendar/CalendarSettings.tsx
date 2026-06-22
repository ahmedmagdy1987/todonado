import { useRef, useState, type ChangeEvent } from 'react'
import { CalendarDays, FileUp, Link2, Trash2 } from 'lucide-react'
import { Button, Card, Input } from '@/components/ui'
import { useToast } from '@/components/common/toast-context'
import type { CalendarSource } from '@/types/database'
import { useCalendarSources } from './api/useCalendarSources'

/** Cap stored .ics uploads so we don't persist multi-MB blobs per user. */
const MAX_ICS_BYTES = 1_000_000

function hostLabel(url: string): string {
  try {
    return new URL(url.replace(/^webcal:/i, 'https:')).hostname
  } catch {
    return 'Calendar'
  }
}

function SourceRow({ source, onRemove }: { source: CalendarSource; onRemove: () => void }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-surface-2/40 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {source.kind === 'url' ? (
          <Link2 className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        ) : (
          <FileUp className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm text-text-primary">{source.label}</p>
          <p className="truncate text-xs text-text-muted">
            {source.kind === 'url' ? source.url : 'Uploaded .ics file'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${source.label}`}
        className="focus-ring shrink-0 rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </li>
  )
}

/**
 * Settings card for ICS calendar busy-import. File upload is the reliable path
 * (no extra infra); URL-subscribe is best-effort (browser CORS usually blocks
 * third-party .ics — a reliable fetch would need a serverless/Edge proxy).
 */
export function CalendarSettings() {
  const { sources, addSource, removeSource } = useCalendarSources()
  const toast = useToast()
  const [url, setUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function addUrl() {
    const u = url.trim()
    if (!/^(https?:|webcal:)\/\//i.test(u)) {
      toast.show('Enter an https:// or webcal:// .ics URL')
      return
    }
    addSource.mutate(
      { kind: 'url', label: hostLabel(u), url: u },
      { onSuccess: () => { setUrl(''); toast.show('Calendar added — refresh Today to see meetings') } },
    )
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = '' // allow re-selecting the same file
    if (!file) return
    if (file.size > MAX_ICS_BYTES) {
      toast.show('That .ics file is too large (max 1 MB)')
      return
    }
    const text = await file.text()
    if (!text.includes('BEGIN:VEVENT')) {
      toast.show('That doesn’t look like a calendar (.ics) file')
      return
    }
    addSource.mutate(
      { kind: 'file', label: file.name, ics_text: text },
      { onSuccess: () => toast.show('Calendar imported') },
    )
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
          <CalendarDays className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold">Calendar</h3>
          <p className="text-sm text-text-muted">
            Import a calendar so today’s meetings subtract from your capacity. Only event times are
            used — never titles or attendees.
          </p>
        </div>
      </div>

      {sources.length > 0 && (
        <ul className="mb-4 space-y-2">
          {sources.map((s) => (
            <SourceRow key={s.id} source={s} onRemove={() => removeSource.mutate(s.id)} />
          ))}
        </ul>
      )}

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="url"
            inputMode="url"
            placeholder="https://… or webcal://… .ics URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Calendar .ics URL"
          />
          <Button type="button" onClick={addUrl} loading={addSource.isPending} className="sm:w-auto">
            <Link2 className="h-4 w-4" aria-hidden /> Subscribe
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".ics,text/calendar"
            onChange={onFile}
            className="hidden"
            aria-hidden
          />
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4" aria-hidden /> Upload .ics file
          </Button>
          <span className="text-xs text-text-muted">Most reliable — works offline.</span>
        </div>

        <p className="text-xs text-text-muted/80">
          Tip: file upload always works. A subscribed URL may be blocked by the calendar provider in
          the browser (CORS); if it can’t refresh, Today falls back to task-only capacity.
        </p>
      </div>
    </Card>
  )
}
