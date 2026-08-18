import { useEffect, useRef, type CSSProperties } from 'react'
import { usePrefersReducedMotion } from '../demo/useReveal'

/**
 * The marketing pages' ambient background: a slow aurora mesh, three parallax
 * planes, a grain tile and a little drifting dust.
 *
 * ── WHY IT IS BUILT THIS WAY ────────────────────────────────────────────────
 *
 * NO ANIMATION LIBRARY, AND NO PER-FRAME JS FOR THE MOTION. Every moving thing
 * is a CSS keyframe on `transform`/`opacity` (see `.living-bg` in index.css), so
 * the compositor owns it and the main thread is free. The only JS that runs per
 * frame is ONE number — the scroll offset — written to a CSS custom property.
 * A canvas or a spring library would have cost kilobytes and main-thread time to
 * do less.
 *
 * IT PARKS WHEN NOBODY IS LOOKING. `visibilitychange` flips `data-paused`, which
 * pauses every keyframe, and the scroll listener detaches with it. A background
 * tab should not be burning a phone battery on a decoration.
 *
 * REDUCED MOTION REMOVES THE MOTION, NOT THE DESIGN. The global
 * `prefers-reduced-motion` rule in the base layer already freezes the keyframes;
 * this component additionally skips the scroll listener entirely and renders no
 * dust. What is left is the full aurora composition, held still — still deep,
 * still on-brand, just not moving.
 *
 * It is `aria-hidden` and `pointer-events-none`: purely decorative, and the page
 * is completely usable with this component deleted.
 */

/**
 * Parallax planes, slowest first. The multiplier is applied to the scroll offset,
 * so a plane at -0.03 moves 3% of the page's speed — far away. Negative because
 * the background should lag DOWN as the content travels up.
 */
const PLANES = [
  { depth: -0.03, blob: 'living-bg__blob--violet' },
  { depth: -0.06, blob: 'living-bg__blob--blue' },
  { depth: -0.1, blob: 'living-bg__blob--mint' },
] as const

/**
 * Dust specks. A FIXED table, never `Math.random()`: a random layout would differ
 * between renders, defeat any snapshot, and make a screenshot diff meaningless.
 * Fourteen is the number where it reads as atmosphere rather than as weather.
 */
const DUST = [
  { left: '8%', top: '82%', dur: '48s', delay: '0s' },
  { left: '17%', top: '95%', dur: '61s', delay: '7s' },
  { left: '26%', top: '74%', dur: '39s', delay: '14s' },
  { left: '34%', top: '90%', dur: '55s', delay: '3s' },
  { left: '43%', top: '86%', dur: '44s', delay: '21s' },
  { left: '51%', top: '97%', dur: '58s', delay: '11s' },
  { left: '59%', top: '79%', dur: '36s', delay: '26s' },
  { left: '66%', top: '92%', dur: '50s', delay: '17s' },
  { left: '73%', top: '84%', dur: '64s', delay: '5s' },
  { left: '80%', top: '96%', dur: '41s', delay: '30s' },
  { left: '86%', top: '77%', dur: '53s', delay: '9s' },
  { left: '92%', top: '89%', dur: '46s', delay: '23s' },
  { left: '12%', top: '68%', dur: '59s', delay: '34s' },
  { left: '69%', top: '66%', dur: '43s', delay: '19s' },
] as const

export function LivingBackground({ contained = false }: { contained?: boolean } = {}) {
  const reduced = usePrefersReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)

  // --- parallax ------------------------------------------------------------
  // One passive scroll listener, coalesced into one rAF, writing one custom
  // property. No React state: a re-render per scroll frame would be exactly the
  // main-thread cost this design exists to avoid.
  useEffect(() => {
    const el = rootRef.current
    if (!el || reduced) return

    let frame = 0
    let latest = -1

    const apply = () => {
      frame = 0
      const y = window.scrollY
      if (y === latest) return
      latest = y
      el.style.setProperty('--living-scroll', `${y}px`)
    }
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(apply)
    }

    apply()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [reduced])

  // --- park when the tab is hidden -----------------------------------------
  // Set as an attribute rather than through React state so a tab-switch costs
  // one attribute write instead of a render of the whole tree.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const sync = () => {
      el.dataset.paused = document.visibilityState === 'hidden' ? 'true' : 'false'
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={contained ? 'living-bg living-bg--contained' : 'living-bg'}
      data-paused="false"
    >
      {PLANES.map((plane) => (
        <div
          key={plane.blob}
          className="living-bg__layer"
          style={{ '--depth': plane.depth } as CSSProperties}
        >
          <span className={`living-bg__blob ${plane.blob}`} />
        </div>
      ))}

      <div className="living-bg__grain" />

      {/* No dust at all under reduced motion — a static speck field would just be
          fourteen stray dots. */}
      {!reduced && (
        <div className="living-bg__dust">
          {DUST.map((d) => (
            <span
              key={`${d.left}-${d.top}`}
              className="living-bg__speck"
              style={
                {
                  left: d.left,
                  top: d.top,
                  '--dur': d.dur,
                  '--delay': d.delay,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
