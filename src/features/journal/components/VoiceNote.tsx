import { Link } from 'react-router-dom'
import { Loader2, Mic, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { InterestChip } from '@/components/common/InterestChip'
import { cn } from '@/lib/utils'
import { formatDuration } from '../journal'
import { useAudioUrl } from '../api/useJournal'
import type { Recording, RecorderState } from '../useRecorder'

/**
 * The voice note: record, hear it back, keep it or scrap it.
 *
 * Every state this can be in has its own copy, and none of them pretends. An
 * unsupported browser, a refused microphone and a Free plan are three different
 * situations with three different honest answers — collapsing them into one
 * greyed-out button would tell the user nothing about which applies to them.
 */
export function VoiceNote({
  isPro,
  state,
  seconds,
  maxSeconds,
  recording,
  error,
  savedPath,
  savedSeconds,
  busy,
  onStart,
  onStop,
  onDiscard,
  onRemoveSaved,
}: {
  isPro: boolean
  state: RecorderState
  seconds: number
  maxSeconds: number
  recording: Recording | null
  error: string | null
  /** A recording already stored against today's entry. */
  savedPath: string | null
  savedSeconds: number | null
  busy: boolean
  onStart: () => void
  onStop: () => void
  onDiscard: () => void
  onRemoveSaved: () => void
}) {
  const { data: savedUrl, isPending: urlPending } = useAudioUrl(savedPath)

  return (
    <section
      aria-labelledby="journal-voice"
      className="rounded-2xl border border-white/5 bg-surface-2/30 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="journal-voice" className="font-display text-sm font-semibold">
          Say it instead
        </h3>
        {!isPro && (
          <span className="rounded-full border border-brand/30 px-2 py-0.5 text-[11px] text-brand">
            Pro
          </span>
        )}
      </div>

      {!isPro ? (
        <p className="mt-2 text-xs leading-relaxed text-text-muted">
          Voice notes are part of Pro. Everything you type stays free, for as long as you keep
          writing it.{' '}
          <Link
            to="/settings/plan"
            className="focus-ring rounded text-accent underline-offset-4 hover:underline"
          >
            See the plans
          </Link>
          .
        </p>
      ) : state === 'unsupported' ? (
        <p className="mt-2 text-xs leading-relaxed text-text-muted">
          This browser can&rsquo;t record audio — it has no MediaRecorder, or the page isn&rsquo;t
          on a secure connection. The written journal works exactly as it does everywhere else.
        </p>
      ) : state === 'denied' ? (
        <p className="mt-2 text-xs leading-relaxed text-text-muted">
          The microphone is blocked for this site. Allow it in your browser&rsquo;s settings if you
          want to record; nothing else here needs it.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {/* A saved recording, played back through a short-lived signed URL. */}
          {savedPath && !recording && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface/60 p-3">
              {urlPending ? (
                <span className="inline-flex items-center gap-2 text-xs text-text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading…
                </span>
              ) : savedUrl ? (
                <audio
                  controls
                  src={savedUrl}
                  className="h-9 min-w-0 flex-1"
                  aria-label="Today's voice note"
                />
              ) : (
                <span className="text-xs text-danger">That recording could not be loaded.</span>
              )}
              <span className="font-mono text-[11px] text-text-muted">
                {formatDuration(savedSeconds ?? 0)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={onRemoveSaved}
                disabled={busy}
                aria-label="Delete the voice note"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}

          {/* A fresh recording, played back locally — nothing is uploaded until
              the entry is saved, so scrapping a take costs nothing. */}
          {recording && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface/60 p-3">
              <audio controls src={recording.url} className="h-9 min-w-0 flex-1" aria-label="New recording" />
              <span className="font-mono text-[11px] text-text-muted">
                {formatDuration(recording.seconds)}
              </span>
              <Button size="sm" variant="ghost" onClick={onDiscard} aria-label="Discard the recording">
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {state === 'recording' ? (
              <Button size="sm" variant="danger" onClick={onStop}>
                <Square className="h-4 w-4" aria-hidden /> Stop
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={onStart} disabled={state === 'requesting'}>
                {state === 'requesting' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Mic className="h-4 w-4" aria-hidden />
                )}
                {recording || savedPath ? 'Record again' : 'Record'}
              </Button>
            )}

            {state === 'recording' && (
              <span
                role="status"
                aria-live="off"
                className={cn('font-mono text-xs tabular-nums', seconds >= maxSeconds - 15 && 'text-warning')}
              >
                {formatDuration(seconds)} / {formatDuration(maxSeconds)}
              </span>
            )}
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
          <p className="text-xs leading-relaxed text-text-muted">
            Up to {Math.round(maxSeconds / 60)} minutes. Stored privately — playback links are
            signed and expire, and deleting the entry deletes the audio with it.
          </p>
        </div>
      )}
    </section>
  )
}

/**
 * The AI layer, stated plainly and not built.
 *
 * A journal that reads itself back and finds the patterns is the version worth
 * having, and it needs a provider this app does not have. So this says exactly
 * that and offers a vote — no placeholder "insights", no fake summary, and no
 * date it cannot keep.
 */
export function AiNotBuiltNote() {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl border border-white/5 bg-surface-2/30 p-4">
      <p className="text-sm font-medium text-text-primary">
        AI review of your entries isn&rsquo;t built yet
      </p>
      <p className="text-xs leading-relaxed text-text-muted">
        Reading a fortnight back and telling you what keeps going wrong needs an AI provider
        Todonado doesn&rsquo;t have yet. Rather than ship a summary that isn&rsquo;t really reading
        anything, there&rsquo;s nothing here — one tap registers a vote for building it properly.
      </p>
      <InterestChip
        featureKey="ai_coach"
        source="journal"
        label="I’d want this"
        className="mt-1"
      />
    </div>
  )
}
