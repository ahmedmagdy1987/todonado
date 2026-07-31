import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { NotebookPen, Search, Trash2, Volume2 } from 'lucide-react'
import { Button, Card, CardContent, Input, Textarea } from '@/components/ui'
import { useAuth } from '@/features/auth/auth-context'
import { usePlan } from '@/features/billing/usePlan'
import { historyCutoffDay } from '@/features/history/historyWindow'
import { FREE_HISTORY_DAYS } from '@/lib/config'
import { todayISO } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { JournalEntry } from '@/types/database'
import {
  type EntrySections,
  EMPTY_SECTIONS,
  MAX_AUDIO_SECONDS,
  audioKey,
  entryForDay,
  parseEntry,
  previewOf,
  searchEntries,
  serialiseEntry,
  sortEntries,
  validateEntry,
  windowEntries,
} from './journal'
import {
  removeJournalAudio,
  uploadJournalAudio,
  useAudioUrl,
  useJournalEntries,
  useJournalMutations,
} from './api/useJournal'
import { useRecorder } from './useRecorder'
import { AiNotBuiltNote, VoiceNote } from './components/VoiceNote'

/**
 * The daily journal.
 *
 * ONE ENTRY PER LOCAL DAY, EDITABLE ON THE DAY IT IS ABOUT. Past entries are
 * read-only (and deletable) on purpose: a review you can quietly rewrite next
 * week is not a review, and the value of "what could go better" comes entirely
 * from it being what you actually thought at the time.
 *
 * THE AI LAYER IS NOT BUILT AND SAYS SO. See `AiNotBuiltNote` — there is no
 * placeholder summary and no invented insight, because a journal that pretends
 * to read you back is worse than one that admits it doesn't.
 */
export function JournalPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const { isPro } = usePlan()
  const today = todayISO()

  const { data, isPending } = useJournalEntries(userId)
  const { saveEntry, updateEntry, deleteEntry } = useJournalMutations(userId)
  const recorder = useRecorder(MAX_AUDIO_SECONDS)

  const rows = useMemo(() => sortEntries(data?.rows ?? []), [data])
  /** False ONLY when the table is absent (migration pending). */
  const available = data?.available ?? true

  const todayEntry = useMemo(() => entryForDay(rows, today), [rows, today])
  const [sections, setSections] = useState<EntrySections>(EMPTY_SECTIONS)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  /**
   * Seed the form from today's entry, but NEVER over unsaved typing. Without the
   * dirty guard a background refetch would replace half-written sentences with
   * whatever the server last heard.
   */
  useEffect(() => {
    if (dirty) return
    setSections(parseEntry(todayEntry?.text ?? null))
  }, [todayEntry, dirty])

  const set = (key: keyof EntrySections) => (value: string) => {
    setDirty(true)
    setError(null)
    setSections((p) => ({ ...p, [key]: value }))
  }

  const busy = saveEntry.isPending || updateEntry.isPending || deleteEntry.isPending

  /**
   * Save today.
   *
   * The ORDER here is the whole point when a recording is involved:
   *   1. upload the new object,
   *   2. write the row pointing at it,
   *   3. only then remove the object it replaced.
   * A failure at (2) deletes the object just uploaded, so a failed save never
   * leaves a file nobody can reach but everybody pays for; and the old recording
   * is never destroyed until its replacement is safely referenced.
   */
  async function save() {
    const result = validateEntry(sections)
    if (!result.ok && !recorder.recording && !todayEntry?.audio_path) {
      setError(result.error)
      return
    }
    setError(null)

    const text = serialiseEntry(sections)
    let newPath: string | null = null
    try {
      if (recorder.recording) {
        newPath = audioKey(userId, today, Math.random().toString(36).slice(2, 10))
        await uploadJournalAudio(newPath, recorder.recording.blob)
      }
      const previousPath = todayEntry?.audio_path ?? null
      await saveEntry.mutateAsync({
        entry_date: today,
        text: text || null,
        audio_path: newPath ?? previousPath,
        audio_seconds: newPath ? recorder.recording!.seconds : (todayEntry?.audio_seconds ?? null),
      })
      if (newPath && previousPath && previousPath !== newPath) {
        // Best effort: the row already points at the new object, so a failure
        // here costs storage, not correctness.
        await removeJournalAudio(previousPath).catch(() => {})
      }
      recorder.discard()
      setDirty(false)
    } catch (e) {
      if (newPath) await removeJournalAudio(newPath).catch(() => {})
      setError(e instanceof Error ? e.message : 'That could not be saved.')
    }
  }

  /** Drop today's recording but keep the writing. */
  async function removeSavedAudio() {
    if (!todayEntry?.audio_path) return
    const path = todayEntry.audio_path
    await updateEntry.mutateAsync({
      id: todayEntry.id,
      patch: { audio_path: null, audio_seconds: null },
    })
    await removeJournalAudio(path).catch(() => {})
  }

  // Free sees the same rolling history window as every other history surface.
  const cutoff = isPro ? null : historyCutoffDay(FREE_HISTORY_DAYS, today)
  const past = rows.filter((e) => e.entry_date !== today)
  const { visible, hiddenCount } = windowEntries(past, cutoff)
  const listed = searchEntries(visible, query)

  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
          <NotebookPen className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">Journal</h2>
          <p className="text-sm text-text-muted">
            How did today go? Two prompts and a blank space — that&rsquo;s the whole thing.
          </p>
        </div>
      </header>

      {!available ? (
        <NotSwitchedOnCard />
      ) : isPending ? (
        <div className="h-64 animate-pulse rounded-2xl border border-white/5 bg-surface-2/40" />
      ) : (
        <>
          <Card>
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-base font-semibold">Today</h3>
                <span className="font-mono text-[11px] text-text-muted">{today}</span>
              </div>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-text-muted">
                What got done?
                <Textarea
                  value={sections.done}
                  onChange={(e) => set('done')(e.target.value)}
                  placeholder="Even the small things."
                  rows={3}
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-text-muted">
                What could go better?
                <Textarea
                  value={sections.better}
                  onChange={(e) => set('better')(e.target.value)}
                  placeholder="Not a telling-off — just what you'd change."
                  rows={3}
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-text-muted">
                Anything else
                <Textarea
                  value={sections.notes}
                  onChange={(e) => set('notes')(e.target.value)}
                  placeholder="Whatever's on your mind."
                  rows={3}
                />
              </label>

              <VoiceNote
                isPro={isPro}
                state={recorder.state}
                seconds={recorder.seconds}
                maxSeconds={recorder.maxSeconds}
                recording={recorder.recording}
                error={recorder.error}
                savedPath={todayEntry?.audio_path ?? null}
                savedSeconds={todayEntry?.audio_seconds ?? null}
                busy={busy}
                onStart={() => void recorder.start()}
                onStop={recorder.stop}
                onDiscard={recorder.discard}
                onRemoveSaved={() => void removeSavedAudio()}
              />

              {error && <p className="text-sm text-danger">{error}</p>}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void save()} disabled={busy}>
                  {todayEntry ? 'Save changes' : 'Save entry'}
                </Button>
                {saveEntry.isSuccess && !dirty && !recorder.recording && (
                  <span role="status" className="font-mono text-xs text-success">
                    Saved
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <section aria-labelledby="journal-past" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="journal-past" className="font-display text-sm font-semibold text-text-muted">
                Earlier
              </h3>
              <label className="relative">
                <span className="sr-only">Search entries</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  className="w-56 pl-9"
                />
              </label>
            </div>

            {listed.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-text-muted">
                  {query
                    ? 'Nothing matches that.'
                    : 'Nothing earlier yet. Come back tomorrow — that is rather the point.'}
                </CardContent>
              </Card>
            ) : (
              <ul className="space-y-2">
                {listed.map((e) => (
                  <PastEntry key={e.id} entry={e} onDelete={() => deleteEntry.mutate(e)} />
                ))}
              </ul>
            )}

            {hiddenCount > 0 && (
              <div className="rounded-2xl border border-white/5 bg-surface-2/30 p-4">
                <p className="text-xs leading-relaxed text-text-muted">
                  {hiddenCount} older {hiddenCount === 1 ? 'entry is' : 'entries are'} outside the{' '}
                  {FREE_HISTORY_DAYS}-day window on Free.{' '}
                  <span className="text-text-primary">Nothing has been deleted</span> —{' '}
                  <Link
                    to="/settings/plan"
                    className="focus-ring rounded text-accent underline-offset-4 hover:underline"
                  >
                    Pro
                  </Link>{' '}
                  shows the lot again.
                </p>
              </div>
            )}
          </section>
        </>
      )}

      {/* OUTSIDE the availability branch on purpose: "the AI layer isn't built"
          is true whether or not the table exists, and a visitor who lands on the
          unmigrated page deserves the same honest answer as everyone else. */}
      <AiNotBuiltNote />
    </div>
  )
}

/**
 * A past entry: readable, deletable, NOT editable.
 *
 * See the page header — the point of "what could go better" is that it is what
 * you thought at the time, and an entry you can quietly revise next week has
 * stopped being a record of anything.
 */
function PastEntry({ entry, onDelete }: { entry: JournalEntry; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const sections = parseEntry(entry.text)
  const preview = previewOf(entry)

  return (
    <li className="rounded-2xl border border-white/5 bg-surface/60">
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="focus-ring min-w-0 flex-1 rounded text-left"
        >
          <span className="font-mono text-xs text-text-muted">{entry.entry_date}</span>
          <span className="mt-0.5 block truncate text-sm text-text-primary">
            {preview || <span className="text-text-muted">Voice note only</span>}
          </span>
        </button>
        {entry.audio_path && (
          <Volume2 className="h-4 w-4 shrink-0 text-accent" aria-label="Has a voice note" />
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete the entry for ${entry.entry_date}`}
          className="tap-44 focus-ring rounded-lg p-1.5 text-text-muted hover:text-danger"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-white/5 p-4">
          {(['done', 'better', 'notes'] as const).map((key) =>
            sections[key] ? (
              <div key={key}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                  {key === 'done' ? 'What got done' : key === 'better' ? 'What could go better' : 'Notes'}
                </p>
                <p className={cn('mt-1 whitespace-pre-wrap text-sm text-text-primary')}>
                  {sections[key]}
                </p>
              </div>
            ) : null,
          )}
          {entry.audio_path && <PastAudio entry={entry} />}
        </div>
      )}
    </li>
  )
}

/**
 * Its own component so the signed URL is only ever requested for an entry the
 * user actually opened — this mounts on expand, and the query is keyed by the
 * object path, so collapsed entries cost nothing.
 */
function PastAudio({ entry }: { entry: JournalEntry }) {
  const { data: url } = useAudioUrl(entry.audio_path)
  if (!url) return null
  return (
    <audio
      controls
      src={url}
      className="h-9 w-full"
      aria-label={`Voice note from ${entry.entry_date}`}
    />
  )
}

/** The honest state when `journal_entries` does not exist yet. */
function NotSwitchedOnCard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <h3 className="font-display text-lg font-semibold">Not switched on yet</h3>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-text-muted">
          The journal is built and waiting on a database migration. Nothing is missing from your
          account — this page will start working the moment it is applied.
        </p>
      </CardContent>
    </Card>
  )
}
