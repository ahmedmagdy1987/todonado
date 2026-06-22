import { useEffect, useRef, useState } from 'react'
import { Moon, Pause, Play, Repeat, Square, Volume2 } from 'lucide-react'
import { Button, Select } from '@/components/ui'
import { formatClock } from '@/features/focus/timer'
import { cn } from '@/lib/utils'
import { resolveTrackSrc, type AudioTrack } from './tracks'

const SLEEP_OPTIONS = [
  { label: 'No sleep timer', value: 0 },
  { label: 'Stop in 5 min', value: 5 },
  { label: 'Stop in 15 min', value: 15 },
  { label: 'Stop in 30 min', value: 30 },
  { label: 'Stop in 60 min', value: 60 },
]

/**
 * One reusable audio player: play/pause, loop, volume, and a sleep timer that
 * auto-stops after N minutes. Shared by Sleep sounds and Guided meditation.
 * Mounted only for the active track (keyed by id), so exactly one plays at once.
 */
export function AudioPlayer({ track, onStop }: { track: AudioTrack; onStop: () => void }) {
  const src = resolveTrackSrc(track)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(track.category === 'sleep') // ambient loops by default
  const [volume, setVolume] = useState(0.8)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState(false)
  const [sleepMin, setSleepMin] = useState(0)
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])
  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = loop
  }, [loop])

  // Autoplay on mount — this follows the user's click that activated the track.
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = volume
    el.loop = loop
    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sleep timer: a wall-clock deadline; tick to update the countdown + auto-pause.
  useEffect(() => {
    if (sleepEndsAt === null) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= sleepEndsAt) {
        audioRef.current?.pause()
        setSleepEndsAt(null)
        setSleepMin(0)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [sleepEndsAt])

  function togglePlay() {
    const el = audioRef.current
    if (!el) return
    if (el.paused) el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    else el.pause()
  }

  function changeSleep(min: number) {
    setSleepMin(min)
    setSleepEndsAt(min > 0 ? Date.now() + min * 60_000 : null)
  }

  function stop() {
    const el = audioRef.current
    if (el) {
      el.pause()
      el.currentTime = 0
    }
    onStop()
  }

  const sleepRemaining = sleepEndsAt ? Math.max(0, Math.ceil((sleepEndsAt - now) / 1000)) : 0

  return (
    <div className="space-y-3 rounded-xl border border-white/5 bg-surface-2/30 p-3">
      <audio
        ref={audioRef}
        src={src ?? undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onError={() => setError(true)}
      />

      {error ? (
        <p role="alert" className="text-sm text-danger">
          Couldn&rsquo;t load this audio. Check the source and try again.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="secondary"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            </Button>

            <button
              type="button"
              onClick={() => setLoop((l) => !l)}
              aria-pressed={loop}
              aria-label="Loop"
              title={loop ? 'Looping' : 'Loop off'}
              className={cn(
                'focus-ring rounded-lg p-2 transition-colors',
                loop ? 'text-brand' : 'text-text-muted hover:text-text-primary',
              )}
            >
              <Repeat className="h-4 w-4" aria-hidden />
            </button>

            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Volume"
                className="accent-brand"
              />
            </div>

            <button
              type="button"
              onClick={stop}
              aria-label="Stop and close"
              title="Stop"
              className="focus-ring ml-auto rounded-lg p-2 text-text-muted transition-colors hover:text-text-primary"
            >
              <Square className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {duration > 0 && (
            <div className="flex items-center gap-2 font-mono text-xs text-text-muted">
              <span>{formatClock(current)}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${duration ? (current / duration) * 100 : 0}%` }}
                />
              </div>
              <span>{formatClock(duration)}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Moon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
            <Select
              value={sleepMin}
              onChange={(e) => changeSleep(Number(e.target.value))}
              aria-label="Sleep timer"
              className="h-8 w-44"
            >
              {SLEEP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            {sleepEndsAt && (
              <span className="font-mono text-xs text-text-muted">
                stops in {formatClock(sleepRemaining)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
