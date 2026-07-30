import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from './journal'

/**
 * Voice notes, on top of MediaRecorder.
 *
 * ── ELAPSED TIME IS DERIVED FROM A TIMESTAMP, NEVER TICK-COUNTED ─────────────
 * The same discipline as the Focus timer and the breathwork pacer: a counter
 * incremented on an interval drifts, and drifts WORSE the moment the tab is
 * throttled — which is exactly what a phone does when the screen dims while you
 * are talking. The recording itself is however long it is; the number on screen
 * has to agree with it, so it is computed from `Date.now()` every frame instead
 * of being accumulated.
 *
 * ── UNSUPPORTED IS A FIRST-CLASS STATE, NOT AN ERROR ─────────────────────────
 * MediaRecorder is absent on older Safari and in some embedded webviews, and
 * getUserMedia is unavailable outside a secure context. Neither is a fault the
 * user can fix, so both resolve to `unsupported`, and the page shows the text
 * journal with an honest line rather than a broken record button.
 *
 * ── A DENIED MICROPHONE IS ALSO NOT AN ERROR ─────────────────────────────────
 * It is a decision. It gets its own state and its own calm copy, and the
 * feature never asks again unprompted.
 */

export type RecorderState =
  | 'unsupported'
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'ready'
  | 'denied'
  | 'error'

export interface Recording {
  blob: Blob
  seconds: number
  /** Object URL for local playback BEFORE anything is uploaded. */
  url: string
}

/** Is recording possible at all, right now, in this browser? */
export function recordingSupported(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof MediaRecorder === 'undefined') return false
  return !!navigator.mediaDevices?.getUserMedia
}

/** The best container this browser will actually produce. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported?.(type)) return type
  }
  return undefined
}

export function useRecorder(maxSeconds: number = MAX_AUDIO_SECONDS) {
  const [state, setState] = useState<RecorderState>(() =>
    recordingSupported() ? 'idle' : 'unsupported',
  )
  const [seconds, setSeconds] = useState(0)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const stream = useRef<MediaStream | null>(null)
  const startedAt = useRef(0)
  const frame = useRef(0)
  /** Set when the caller stopped deliberately, so onstop can tell why it fired. */
  const stopping = useRef(false)

  /** Release the microphone. The browser's recording indicator must go away. */
  const releaseStream = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }, [])

  const clearTimer = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = 0
  }, [])

  const discard = useCallback(() => {
    setRecording((prev) => {
      // Object URLs are a leak if they are not revoked, and a long journalling
      // session can make a lot of them.
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    setSeconds(0)
    setError(null)
    if (recordingSupported()) setState('idle')
  }, [])

  const stop = useCallback(() => {
    stopping.current = true
    clearTimer()
    if (recorder.current && recorder.current.state !== 'inactive') {
      recorder.current.stop()
    }
  }, [clearTimer])

  const start = useCallback(async () => {
    if (!recordingSupported()) {
      setState('unsupported')
      return
    }
    discard()
    setState('requesting')
    setError(null)
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.current = media
      const mimeType = pickMimeType()
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
      recorder.current = rec
      chunks.current = []
      stopping.current = false

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data)
      }

      rec.onstop = () => {
        clearTimer()
        releaseStream()
        const blob = new Blob(chunks.current, { type: mimeType ?? 'audio/webm' })
        chunks.current = []
        const elapsed = Math.min(maxSeconds, Math.round((Date.now() - startedAt.current) / 1000))

        if (blob.size === 0) {
          setState('error')
          setError('Nothing was recorded. Check the microphone and try again.')
          return
        }
        if (blob.size > MAX_AUDIO_BYTES) {
          // The bucket would refuse it anyway; saying so here beats a failed
          // upload after the user thinks they are done.
          setState('error')
          setError('That recording is too large to save. Try a shorter one.')
          return
        }
        setRecording({ blob, seconds: Math.max(1, elapsed), url: URL.createObjectURL(blob) })
        setSeconds(Math.max(1, elapsed))
        setState('ready')
      }

      startedAt.current = Date.now()
      rec.start()
      setState('recording')

      const tick = () => {
        const elapsed = (Date.now() - startedAt.current) / 1000
        setSeconds(Math.floor(elapsed))
        if (elapsed >= maxSeconds) {
          // The cap stops it for you rather than failing on save.
          stop()
          return
        }
        frame.current = requestAnimationFrame(tick)
      }
      frame.current = requestAnimationFrame(tick)
    } catch (e) {
      releaseStream()
      const name = (e as { name?: string })?.name
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState('denied')
        return
      }
      setState('error')
      setError(
        name === 'NotFoundError'
          ? 'No microphone found on this device.'
          : 'The microphone could not be started.',
      )
    }
  }, [clearTimer, discard, maxSeconds, releaseStream, stop])

  // Never leave the microphone open, and never leave an object URL behind.
  useEffect(
    () => () => {
      clearTimer()
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
      releaseStream()
    },
    [clearTimer, releaseStream],
  )

  useEffect(
    () => () => {
      if (recording) URL.revokeObjectURL(recording.url)
    },
    [recording],
  )

  return { state, seconds, recording, error, start, stop, discard, maxSeconds }
}
