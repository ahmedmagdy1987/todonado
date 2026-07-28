import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Motion primitives for the landing page.
 *
 * STRICT RULE: `prefers-reduced-motion: reduce` disables every non-essential
 * animation. Reveals resolve instantly (content is never hidden), self-playing
 * demos jump straight to their end state, and the interactive widgets keep
 * working — motion is decoration here, never the mechanism.
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** Live-tracks the user's reduced-motion preference (re-renders if they change it). */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(REDUCED_MOTION_QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(REDUCED_MOTION_QUERY)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    setReduced(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

interface InViewOptions {
  /** Fire once and stop observing (the default — reveals shouldn't re-run). */
  once?: boolean
  rootMargin?: string
  threshold?: number
}

/**
 * True once the element has scrolled into view. Falls back to `true` where
 * IntersectionObserver is unavailable, so content can never be stranded hidden.
 */
export function useInView<T extends Element>({
  once = true,
  rootMargin = '0px 0px -10% 0px',
  threshold = 0.15,
}: InViewOptions = {}): [RefObject<T>, boolean] {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true)
            if (once) observer.disconnect()
          } else if (!once) {
            setInView(false)
          }
        }
      },
      { rootMargin, threshold },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [once, rootMargin, threshold])

  return [ref, inView]
}
