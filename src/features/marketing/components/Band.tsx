import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A section that sits on a real SURFACE rather than on the page-wide aurora.
 *
 * ── WHY THIS EXISTS ALONGSIDE `Chapter` ────────────────────────────────────
 *
 * `Chapter` applies one of five translucent TONES that modulate the shared
 * aurora, which is right for the parts of the page that are atmosphere and
 * argument. But translucency is exactly why the page still read as one
 * continuous gradient from top to bottom: the same background is visibly
 * behind everything, so no boundary ever feels like entering a new part of a
 * document.
 *
 * A band is OPAQUE. It occludes the aurora, so its edges are a change of
 * material rather than a change of light. See the `.band` block in index.css
 * for why that is not the same mistake as coloured bands: every material is
 * built from the locked tokens and none introduces a hue. What varies is
 * opacity and elevation.
 *
 * ── WHEN TO USE WHICH ──────────────────────────────────────────────────────
 *
 * Atmosphere (`Chapter`) for the hero and for anything whose job is mood.
 * A band for anything DENSE AND SCANNABLE: capability lists, comparison
 * tables, plan tables, prices. Small text over a slowly moving gradient is the
 * one place the aurora costs real legibility, and those are exactly the
 * sections a visitor is trying to read carefully rather than feel.
 *
 * `premium` is deliberately spent ONCE, on the commercial turn. Using it twice
 * would make it mean nothing in either place.
 */
export type BandMaterial = 'solid' | 'raised' | 'editorial' | 'premium'

interface BandProps {
  material: BandMaterial
  children: ReactNode
  /** Anchor target for the header's in-page navigation. */
  id?: string
  /** id of the heading that names this band, for the landmark. */
  labelledBy?: string
  className?: string
}

export function Band({ material, children, id, labelledBy, className }: BandProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        'band chapter-pad',
        `band--${material}`,
        // Clears the 64px sticky header plus a little air, so a section
        // arrived at by hash does not open with its heading under the bar.
        id && 'scroll-mt-20',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">{children}</div>
    </section>
  )
}

/**
 * The standard heading block for a band: eyebrow, title, one line of support.
 *
 * Extracted because six sections repeating the same three-element stack with
 * slightly different margins is how a page loses its typographic rhythm.
 */
export function BandHeading({
  eyebrow,
  title,
  lede,
  id,
  align = 'center',
}: {
  eyebrow?: string
  title: ReactNode
  lede?: ReactNode
  id?: string
  align?: 'center' | 'left'
}) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      {eyebrow && (
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      )}
      <h2
        id={id}
        className={cn(
          'font-display font-bold leading-[1.1] tracking-tight',
          'text-2xl sm:text-3xl lg:text-4xl',
          eyebrow && 'mt-3',
        )}
      >
        {title}
      </h2>
      {lede && <p className="mt-4 text-base leading-relaxed text-text-muted">{lede}</p>}
    </div>
  )
}
