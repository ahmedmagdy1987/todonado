import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * THE MATERIAL SYSTEM FOR THE LANDING PAGE.
 *
 * ── WHAT THIS REPLACES, AND WHY IT HAD TO GO ───────────────────────────────
 *
 * `Chapter` painted five "tones" into a layer at `z-index: -1` whose own
 * comment states the intent plainly: a tone MODULATES the shared background
 * rather than replacing it, and each scene fades its top and bottom edge so
 * adjacent tones cross-dissolve over 120px. Both decisions were coherent, and
 * together they guarantee the exact thing the page is now being rebuilt to
 * stop: every section is a semi-transparent wash over one continuous aurora, so
 * the whole document reads as a single gradient from top to bottom and a
 * visitor never feels themselves arrive anywhere.
 *
 * A cross-dissolve is the opposite of a section boundary. You cannot signal
 * "you are somewhere new" with a transition designed to be imperceptible.
 *
 * ── THE RULE THIS ENCODES ──────────────────────────────────────────────────
 *
 * EVERY MATERIAL EXCEPT `brand` IS GENUINELY OPAQUE. Not `bg-surface/80`, not a
 * tinted overlay: a real background colour. That is what makes the boundary
 * between two sections a fact rather than a suggestion.
 *
 * ── ONE LOUD BOUNDARY, NOT A LOUD PAGE ────────────────────────────────────
 *
 * `panel` was `bg-surface` (#0F172A, L* 7.96) against a `#0A0D16` page
 * (L* 3.66): a step of delta-L* 4.30, or 1.09:1, which is below the level at
 * which peripheral vision registers an edge while scrolling. An audit of the
 * rendered page found 92.2% of the first screen inside a six-L* band out of a
 * hundred and concluded it read as one long dark wash.
 *
 * The first fix moved `panel` itself to `bg-surface-2`, which lifted every
 * panel section at once. A visual review of the result rejected it, and the
 * reasons are worth keeping because the numbers all said it was an improvement:
 *
 *   1  IT INVERTED ELEVATION. The cards inside those sections were left at
 *      `#0F172A` while the ground moved out from under them, so they sat 8.4
 *      and 12.7 L* BELOW their own surface. Three cards stopped reading as
 *      cards and became a trough with dividers in it.
 *   2  IT SPENT THE HERO'S MATERIAL. `#1E293B` is the Today panel's own fill,
 *      and the hero works because that panel is the one lit object in a void.
 *      Used as full-bleed ground it covered 2.6 to 3.3 times the panel's area
 *      per section, so by 950px down the page the product's signature surface
 *      just meant "grey".
 *   3  IT ALTERNATED TWICE AND STOPPED. Sections 5, 6 and 7 were always
 *      page-dark; making the top loud only exposed that, giving the page a
 *      rhythm it abandons for its whole second half.
 *
 * So the loud step is now spent exactly once, on the boundary that was actually
 * complained about: the one immediately under the fold. `chapter` is that one
 * section. `panel` is back to `bg-surface`, which is what makes a dark product
 * screenshot sitting on it read as a lit screen in a dark room rather than as a
 * black rectangle pasted onto grey.
 *
 * All values are locked tokens (CLAUDE.md §2). Nothing new was invented.
 *
 * Five materials carry the page, and each has a job:
 *
 *   brand    the hero, and nowhere else. The one atmospheric moment.
 *   chapter  ONE section, directly under the hero. A real step lighter
 *            (delta-L* 12.7), so the first boundary a visitor meets is one they
 *            see without looking for it. Anything placed on it must be lifted
 *            ABOVE it, never left at panel value.
 *   panel    a quiet surface one small step off the page. Used where prose and
 *            DARK product visuals have to sit together.
 *   data     the darker, technical material: page-dark plus a faint ruled grid.
 *            Used for the two sections that are essentially structured data
 *            (the feature map and the comparison), so the texture says "this is
 *            information" before a word is read.
 *   premium  the commercial climax. A contained brand field, clipped INSIDE the
 *            section, so the one place that asks for money is also the one
 *            place with brand light in it after the hero.
 *
 * `quiet` is page-dark with nothing on it, for the close.
 *
 * Alternating `panel` and `data` down the page is what produces the rhythm: the
 * step in luminance at each boundary is visible in peripheral vision while
 * scrolling, which is the actual mechanism behind "I entered a new section".
 */
export type SectionMaterial = 'brand' | 'chapter' | 'panel' | 'data' | 'premium' | 'quiet'

const MATERIAL_CLASS: Record<SectionMaterial, string> = {
  // Transparent on purpose: the hero's own backdrop shows through here only.
  brand: 'bg-transparent',
  // The one loud step, and it is deliberately used once. See the note above
  // before adding a second: the page's rhythm depends on this being rare.
  chapter: 'bg-surface-2 material-chapter',
  panel: 'bg-surface',
  data: 'bg-background material-grid',
  premium: 'bg-background material-premium',
  quiet: 'bg-background',
}

/**
 * A hairline at the top edge of every opaque material.
 *
 * It reads as the seam between two physical surfaces, and it is what stops two
 * adjacent dark materials from looking like one slightly uneven one on a phone
 * screen in daylight. The hero has no seam above it because there is nothing
 * above it.
 */
const SEAM = 'border-t border-white/[0.06]'

export function Section({
  material,
  id,
  children,
  className,
  /** Skip the vertical rhythm (the hero sizes itself). */
  flush = false,
  /** Labelled region, for the anchor nav and for screen-reader navigation. */
  ariaLabel,
}: {
  material: SectionMaterial
  id?: string
  children: ReactNode
  className?: string
  flush?: boolean
  ariaLabel?: string
}) {
  return (
    <section
      id={id}
      aria-label={ariaLabel}
      className={cn(
        'relative',
        MATERIAL_CLASS[material],
        material !== 'brand' && SEAM,
        /*
         * `scroll-mt` so an anchor from the sticky header lands below it rather
         * than under it. 4rem is the header height; the extra breathing room
         * stops the section heading sitting flush against the header edge.
         */
        id && 'scroll-mt-20',
        /*
         * The mobile tier is deliberately much tighter than the desktop one.
         * Seven sections each paying 64px top AND bottom is 900px of a phone
         * page spent on nothing, and it is not what separates the sections
         * here: the opaque material change and the seam do that, so the
         * padding is free to shrink. Desktop keeps its air.
         */
        !flush && 'py-8 sm:py-16 lg:py-24',
        className,
      )}
    >
      {children}
    </section>
  )
}

/**
 * The horizontal container. Wider than the old 6xl because the feature map and
 * the comparison are tables: at 72rem a five-column comparison has room for
 * real words instead of abbreviations, which is the difference between a table
 * a visitor reads and one they skip.
 */
export const CONTAINER = 'mx-auto w-full max-w-6xl px-4 sm:px-6'

/**
 * A section's opening.
 *
 * ── LEFT-ALIGNED BY DEFAULT, AND THAT IS THE POINT ─────────────────────────
 *
 * The page it replaces centred every heading, which produces the rhythm the
 * brief calls out by name: huge centred headline, paragraph, large gap, card,
 * repeat. Centred text also has no consistent left edge, so nothing beneath it
 * can line up with anything, and each section reads as an isolated poster
 * rather than part of a document.
 *
 * Left alignment gives every section the same optical spine as the content
 * under it. `centered` is kept for the two genuinely commercial moments (the
 * pricing climax and the final call to action), where a poster is the right
 * shape.
 */
export function SectionIntro({
  eyebrow,
  title,
  lede,
  centered = false,
  className,
}: {
  eyebrow?: string
  title: ReactNode
  lede?: ReactNode
  centered?: boolean
  className?: string
}) {
  return (
    <div className={cn('max-w-2xl', centered && 'mx-auto text-center', className)}>
      {eyebrow && (
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
      )}
      <h2
        className={cn(
          'font-display text-2xl font-semibold leading-tight text-text-primary sm:text-3xl lg:text-4xl',
          eyebrow && 'mt-3',
        )}
      >
        {title}
      </h2>
      {lede && (
        <p className="mt-4 text-base leading-relaxed text-text-muted sm:text-lg">{lede}</p>
      )}
    </div>
  )
}
