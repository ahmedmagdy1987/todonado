import { useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { CalendarDays, FileUp, Link2, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Input } from '@/components/ui'
import { useToast } from '@/components/common/toast-context'
import { todayISO } from '@/lib/date'
import { useAuth } from '@/features/auth/auth-context'
import { usePlan } from '@/features/billing/usePlan'
import { captureUpgradeIntent } from '@/features/marketing/api/upgradeIntents'
import type { CalendarSource } from '@/types/database'
import { useCalendarSources } from './api/useCalendarSources'
import { useCalendarBusy } from './api/useCalendarBusy'

/** Cap stored .ics uploads so we don't persist multi-MB blobs per user. */
const MAX_ICS_BYTES = 1_000_000

function hostLabel(url: string): string {
  try {
    return new URL(url.replace(/^webcal:/i, 'https:')).hostname
  } catch {
    return 'Calendar'
  }
}

function SourceRow({
  source,
  isPro,
  lastRefreshed,
  onRemove,
}: {
  source: CalendarSource
  isPro: boolean
  lastRefreshed: number | null
  onRemove: () => void
}) {
  const isUrl = source.kind === 'url'
  // A URL source on a Free plan keeps its row and its data — it just stops
  // refreshing. Nothing is deleted, so upgrading resumes it instantly.
  const paused = isUrl && !isPro

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-surface-2/40 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {isUrl ? (
          <Link2 className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        ) : (
          <FileUp className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm text-text-primary">{source.label}</p>
            {isUrl ? (
              <Badge variant={paused ? 'outline' : 'brand'}>{paused ? 'Paused' : 'Live sync'}</Badge>
            ) : (
              <Badge variant="outline">File</Badge>
            )}
          </div>
          <p className="truncate text-xs text-text-muted">
            {!isUrl
              ? 'Uploaded .ics file — always available, never re-fetched'
              : paused
                ? 'Live sync is a Pro feature — this calendar isn’t refreshing'
                : lastRefreshed
                  ? `Refreshed ${formatDistanceToNow(new Date(lastRefreshed), { addSuffix: true })}`
                  : 'Refreshing…'}
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

/** Honest, non-blocking upsell — a card in the flow, never a modal. */
function LiveSyncUpsell({ onUpgradeClick }: { onUpgradeClick: () => void }) {
  return (
    <div
      role="note"
      aria-label="Live calendar sync is a Pro feature"
      className="rounded-2xl border border-brand/25 bg-brand-gradient-soft p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-brand">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            Live calendar sync is Pro — paste a link once, meetings stay fresh daily
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            Free includes calendar import by <strong className="text-text-primary/90">.ics file</strong>{' '}
            — it works today and never expires. Pro fetches your Google, Outlook or Apple link on our
            servers, so today’s meetings are always current without re-uploading.{' '}
            <Link
              to="/settings/plan"
              onClick={onUpgradeClick}
              className="focus-ring rounded text-accent underline-offset-4 hover:underline"
            >
              Upgrade
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Settings card for ICS calendar busy-import.
 *
 * FREE — upload an .ics file. Fully functional, unchanged, offline-friendly.
 * PRO  — subscribe to a calendar URL. Fetched SERVER-side via /api/calendar-fetch
 *        (providers don't send CORS headers, so a browser fetch cannot work), and
 *        refreshed automatically on each load plus a ~12h staleness check.
 */
export function CalendarSettings() {
  const { sources, addSource, removeSource } = useCalendarSources()
  const { isPro } = usePlan()
  const { user } = useAuth()
  const { updatedAt, refresh, hadError } = useCalendarBusy(todayISO())
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [showUpsell, setShowUpsell] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const hasUrlSources = sources.some((s) => s.kind === 'url')

  function recordIntent(source: string) {
    void captureUpgradeIntent({
      tier: 'pro',
      userId: user?.id ?? null,
      email: user?.email ?? null,
      source,
    }).catch(() => {
      /* signal only — never block the click */
    })
  }

  function addUrl() {
    const u = url.trim()
    if (!/^(https?:|webcal:)\/\//i.test(u)) {
      toast.show('Enter an https:// or webcal:// .ics URL')
      return
    }
    // The gate: Free keeps the input (so the value is obvious) but submitting
    // explains the limit instead of silently failing. The real enforcement is
    // server-side in /api/calendar-fetch — this is just the honest UI half.
    if (!isPro) {
      setShowUpsell(true)
      recordIntent('calendar_live_sync')
      return
    }
    addSource.mutate(
      { kind: 'url', label: hostLabel(u), url: u },
      {
        onSuccess: () => {
          setUrl('')
          setShowUpsell(false)
          toast.show('Calendar subscribed — meetings will refresh automatically')
        },
      },
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
            <SourceRow
              key={s.id}
              source={s}
              isPro={isPro}
              lastRefreshed={updatedAt}
              onRemove={() => removeSource.mutate(s.id)}
            />
          ))}
        </ul>
      )}

      {isPro && hasUrlSources && (
        <div className="mb-4 flex items-center gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Refresh now
          </Button>
          {hadError && (
            <span className="text-xs text-warning">
              A calendar didn’t respond last time — Today falls back to task-only capacity.
            </span>
          )}
        </div>
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

        {showUpsell && !isPro && (
          <LiveSyncUpsell onUpgradeClick={() => recordIntent('calendar_live_sync_link')} />
        )}

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
          <span className="text-xs text-text-muted">Free · works offline.</span>
        </div>

        <p className="text-xs text-text-muted/80">
          {isPro
            ? 'Subscribed calendars are fetched on our servers, so provider CORS rules can’t block them. They refresh on each load and at least daily.'
            : 'Uploading a file always works. Subscribing to a link keeps meetings fresh automatically — that’s part of Pro.'}
        </p>
      </div>
    </Card>
  )
}
