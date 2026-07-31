import { useCallback, useEffect, useRef, useState } from 'react'
import { Moon, Pause, Play, Repeat, Square, Volume2 } from 'lucide-react'
import { Button, Select } from '@/components/ui'
import { formatClock } from '@/features/focus/timer'
import { cn } from '@/lib/utils'
import { resolveTrackSrc, type AudioTrack } from './tracks'
import { noiseObjectUrl, releaseNoiseUrls } from './noiseSource'
import { FADE_MS, fadeGain, msUntilDeadline, sleepDeadline, sleepRemainingSeconds } from './playback'

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
  /*
   * A GENERATED track has no file. Its samples are synthesised, encoded to a
   * WAV blob and handed to this same element as an object URL, so every control
   * below (play, pause, volume, loop, the sleep timer) is the code that already
   * existed. Built here, during the render caused by the user's click, so the
   * source is set inside the gesture and autoplay policy stays satisfied.
   */
  const src = track.generator ? noiseObjectUrl(track.generator) : resolveTrackSrc(track)
  const audioRef = useRef<HTMLAudioElement>(null)
  const fadeRef = useRef<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(track.category === 'sleep') // ambient loops by default
  const [volume, setVolume] = useState(0.8)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState(false)
  const [sleepMin, setSleepMin] = useState(0)
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  /**
   * Ramp the element's volume, and cancel any ramp already running.
   *
   * Starting and stopping broadband noise at full level clicks, and a click is
   * the one sound a sleep track must never make. The shaping lives in
   * `fadeGain`; this is only the clock that drives it.
   */
  const ramp = useCallback(
    (direction: 'in' | 'out', target: number, done?: () => void) => {
      const el = audioRef.current
      if (!el) return
      if (fadeRef.current !== null) window.clearInterval(fadeRef.current)
      const started = Date.now()
      el.volume = target * fadeGain(0, FADE_MS, direction)
      fadeRef.current = window.setInterval(() => {
        const elapsed = Date.now() - started
        const g = fadeGain(elapsed, FADE_MS, direction)
        const node = audioRef.current
        if (node) node.volume = Math.max(0, Math.min(1, target * g))
        if (elapsed >= FADE_MS) {
          if (fadeRef.current !== null) window.clearInterval(fadeRef.current)
          fadeRef.current = null
          done?.()
        }
      }, 25)
    },
    [],
  )

  useEffect(() => {
    // Only follow the slider while no fade owns the volume, or the two fight.
    if (audioRef.current && fadeRef.current === null) audioRef.current.volume = volume
  }, [volume])
  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = loop
  }, [loop])

  // Autoplay on mount — this follows the user's click that activated the track.
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.loop = loop
    el.volume = 0
    el.play()
      .then(() => {
        setPlaying(true)
        ramp('in', volume)
      })
      .catch(() => setPlaying(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
   * MEDIA SESSION: what the phone's lock screen shows, and what its hardware
   * pause button talks to. Free with a media element; a Web Audio graph alone
   * gets neither. Guarded because Safari on older iOS has no `mediaSession`.
   */
  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined
    if (!ms) return
    try {
      ms.metadata = new MediaMetadata({
        title: track.title,
        artist: 'Todonado',
        album: track.category === 'sleep' ? 'Sleep sounds' : 'Guided meditation',
        artwork: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      })
      ms.setActionHandler('play', () => void audioRef.current?.play())
      ms.setActionHandler('pause', () => audioRef.current?.pause())
    } catch {
      /* metadata is a nicety; never let it break playback */
    }
    return () => {
      try {
        ms.setActionHandler('play', null)
        ms.setActionHandler('pause', null)
        ms.metadata = null
      } catch {
        /* nothing to undo */
      }
    }
  }, [track.title, track.category])

  /*
   * RELEASE ON UNMOUNT. The generated blob is about half a megabyte and an
   * object URL keeps it alive until revoked; the fade interval would otherwise
   * keep ticking against a detached element.
   */
  useEffect(() => {
    // Captured HERE rather than read inside the cleanup. The <audio> tag is
    // rendered unconditionally, so the ref is already attached by the time an
    // effect runs and it is the same node for this component's whole life --
    // but reading a ref during cleanup is the shape that is wrong far more
    // often than it is right, and eslint is correct to refuse to tell them
    // apart. Capturing costs nothing and keeps the rule enforceable.
    const el = audioRef.current
    return () => {
      if (fadeRef.current !== null) window.clearInterval(fadeRef.current)
      if (el) {
        el.pause()
        el.removeAttribute('src')
        el.load()
      }
      releaseNoiseUrls()
    }
  }, [])

  /*
   * THE SLEEP TIMER IS ONE TIMEOUT, NOT A 1 Hz POLL.
   *
   * Background tabs throttle intervals to roughly once a minute and a locked
   * phone can suspend them outright, which is exactly the situation a sleep
   * timer exists for: an interval-driven deadline fires late precisely when it
   * matters. A single long timeout is honoured far better. The separate
   * one-second interval below only moves the countdown on screen, and nothing
   * depends on it — if it is throttled while hidden, the display is stale for a
   * moment and the stop still happens on time.
   */
  useEffect(() => {
    if (sleepEndsAt === null) return
    const wait = msUntilDeadline(sleepEndsAt, Date.now()) ?? 0
    const stopId = window.setTimeout(() => {
      ramp('out', volume, () => {
        audioRef.current?.pause()
        setSleepEndsAt(null)
        setSleepMin(0)
      })
    }, wait)
    const tickId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearTimeout(stopId)
      window.clearInterval(tickId)
    }
  }, [sleepEndsAt, ramp, volume])

  function togglePlay() {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      el.volume = 0
      el.play()
        .then(() => {
          setPlaying(true)
          ramp('in', volume)
        })
        .catch(() => setPlaying(false))
    } else {
      ramp('out', volume, () => el.pause())
    }
  }

  function changeSleep(min: number) {
    setSleepMin(min)
    setSleepEndsAt(sleepDeadline(min, Date.now()))
  }

  function stop() {
    const el = audioRef.current
    if (!el) {
      onStop()
      return
    }
    ramp('out', volume, () => {
      el.pause()
      el.currentTime = 0
      onStop()
    })
  }

  const sleepRemaining = sleepRemainingSeconds(sleepEndsAt, now)

  return (
    <div className="space-y-3 rounded-xl border border-white/5 bg-surface-2/30 p-3">
      <audio
        ref={audioRef}
        aria-label={track.title}
        data-track-id={track.id}
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
