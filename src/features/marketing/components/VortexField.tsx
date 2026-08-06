import { useEffect, useRef, type CSSProperties } from 'react'
import { usePrefersReducedMotion } from '../demo/useReveal'

/**
 * The hero's signature: a vortex funnel of orbiting task motes.
 *
 * ── WHY THIS, AND NOT A GENERIC GRADIENT BLOB ────────────────────────────────
 *
 * The product is called Todonado and its mark is a tornado. The landing had no
 * trace of that anywhere: the hero was a headline, a card, and a very faint
 * aurora, which is the same page every dark SaaS template ships. This draws the
 * one image the product is actually named after, and it draws it as an ARGUMENT
 * rather than as decoration — scattered work circling a funnel and resolving,
 * at the focal point, into the ordered day the card beside it is showing. The
 * motion means "clarity emerging from a chaotic day". Nothing here is a
 * particle field for the sake of particles.
 *
 * ── HOW IT STAYS CHEAP, WHICH IS THE WHOLE ENGINEERING STORY ─────────────────
 *
 * It obeys the rules `LivingBackground` paid for in measured frame time (see
 * index.css §living background), because they are not style preferences:
 *
 *  • NO `filter: blur()` ANYWHERE. A blurred surface is re-rasterised every
 *    time it moves, which is exactly what took the landing from 60fps to 21.
 *    Every soft edge here is a radial-gradient alpha falloff, rasterised once
 *    and thereafter only transformed.
 *  • ONLY `transform` and `opacity` are animated, so every frame composites on
 *    the GPU and none of it can trigger layout.
 *  • NOTHING SCALES. Scaling re-rasterises a gradient every frame and would
 *    undo the point above. The motes travel by rotating a zero-size parent, so
 *    the mote itself holds one static `translateX` for its whole life.
 *  • The funnel geometry is a STATIC 3D transform — `perspective` + `rotateX`
 *    on the stage, `translateZ` per ring. It is computed once at paint. The
 *    perspective is what turns four concentric circles into a cone rather than
 *    a dartboard, and it costs nothing per frame.
 *  • ONE rAF at a time for the pointer, coalesced, writing two custom
 *    properties. No React state per frame: a re-render per pointer move is the
 *    precise cost this design exists to avoid.
 *  • It parks on `visibilitychange`, so a hidden tab does no compositor work.
 *
 * ── ACCESSIBILITY ────────────────────────────────────────────────────────────
 *
 * `aria-hidden` and `pointer-events-none`: it is decoration, and the hero is
 * complete with this component deleted. Under `prefers-reduced-motion` the
 * funnel KEEPS ITS COMPOSITION — rings, depth, core glow, motes at their
 * resting positions — and simply stops moving, and the pointer listener is
 * never attached. Reduced motion should remove motion, not remove design.
 */

/**
 * The funnel. Each ring is one step further from the viewer (`z`) and wider,
 * which is what reads as a cone once the stage is tilted. Opacity falls with
 * distance so the mouth of the funnel recedes instead of ending on a hard line.
 *
 * A FIXED TABLE, NEVER `Math.random()`: a random funnel would differ between
 * renders, make every screenshot diff meaningless, and defeat the visual
 * regression check in landingMotion.test.ts.
 */
const RINGS = [
  { size: 150, z: 0, o: 0.7, tone: '167,176,255' },
  { size: 250, z: -46, o: 0.52, tone: '129,140,248' },
  { size: 370, z: -98, o: 0.36, tone: '108,92,231' },
  { size: 510, z: -158, o: 0.22, tone: '78,168,255' },
  { size: 670, z: -226, o: 0.12, tone: '108,92,231' },
] as const

/**
 * The task motes. `r` is the orbit radius, `z` places the mote on its ring's
 * plane, `dur` is one full revolution and `delay` is negative so every mote
 * starts mid-orbit — without it all nine would launch from the same angle and
 * the first second would look like a starting gun.
 *
 * Inner orbits are FASTER, which is the physical read (and the emotional one:
 * work accelerates as it converges on the plan). Violet dominates, blue accents,
 * one mint for the same reason the aurora has one: a hint of a third colour.
 */
const MOTES = [
  { r: 75, z: 0, dur: '17s', delay: '-2s', tone: '199,205,255', size: 16 },
  { r: 75, z: 0, dur: '17s', delay: '-11s', tone: '78,168,255', size: 13 },
  { r: 125, z: -46, dur: '26s', delay: '-4s', tone: '167,176,255', size: 19 },
  { r: 125, z: -46, dur: '26s', delay: '-18s', tone: '108,92,231', size: 15 },
  { r: 185, z: -98, dur: '38s', delay: '-7s', tone: '78,168,255', size: 21 },
  { r: 185, z: -98, dur: '38s', delay: '-25s', tone: '129,140,248', size: 17 },
  { r: 255, z: -158, dur: '54s', delay: '-13s', tone: '78,168,255', size: 23 },
  { r: 255, z: -158, dur: '54s', delay: '-36s', tone: '34,211,166', size: 15 },
  { r: 335, z: -226, dur: '72s', delay: '-45s', tone: '108,92,231', size: 25 },
] as const

export function VortexField() {
  const reduced = usePrefersReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)

  // --- pointer depth -------------------------------------------------------
  // Two numbers per frame, written straight to the DOM as custom properties.
  // Gated on `pointer: fine` as well as reduced motion: on a touch screen there
  // is no hover to respond to, and attaching the listener would cost battery
  // for an effect nobody can trigger.
  useEffect(() => {
    const el = rootRef.current
    if (!el || reduced) return
    if (!window.matchMedia('(pointer: fine)').matches) return

    let frame = 0
    let nextX = 0
    let nextY = 0

    const apply = () => {
      frame = 0
      el.style.setProperty('--vx', String(nextX))
      el.style.setProperty('--vy', String(nextY))
    }

    const onMove = (event: PointerEvent) => {
      // Normalised to [-1, 1] from the viewport centre, then damped to a few
      // pixels of travel. Deliberately tiny: this is parallax depth, not a toy.
      nextX = (event.clientX / window.innerWidth - 0.5) * 2 * 14
      nextY = (event.clientY / window.innerHeight - 0.5) * 2 * 10
      if (frame === 0) frame = requestAnimationFrame(apply)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [reduced])

  // --- park when the tab is hidden -----------------------------------------
  // An attribute write rather than React state, so a tab switch costs one
  // mutation instead of a render.
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
    <div ref={rootRef} aria-hidden className="vortex" data-paused="false">
      <div className="vortex__stage">
        {RINGS.map((ring) => (
          <span
            key={ring.size}
            className="vortex__ring"
            style={
              {
                '--size': `${ring.size}px`,
                '--z': `${ring.z}px`,
                '--o': ring.o,
                '--tone': ring.tone,
              } as CSSProperties
            }
          />
        ))}

        {/* The eye of the funnel. Opacity-only pulse, so it is free to animate. */}
        <span className="vortex__core" />

        {MOTES.map((mote, i) => (
          <span
            key={`${mote.r}-${mote.delay}-${i}`}
            className="vortex__orbit"
            style={
              {
                '--z': `${mote.z}px`,
                '--dur': mote.dur,
                '--delay': mote.delay,
              } as CSSProperties
            }
          >
            <span
              className="vortex__mote"
              style={
                {
                  '--r': `${mote.r}px`,
                  '--tone': mote.tone,
                  '--size': `${mote.size}px`,
                } as CSSProperties
              }
            />
          </span>
        ))}
      </div>
    </div>
  )
}
