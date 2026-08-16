import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The five scenes the landing page moves through.
 *
 * Deliberately FIVE, not one per section. An audit of the live page found
 * eighteen sections sharing three background treatments, fifteen of them fully
 * transparent, so 83% of the page was one continuous aurora and every idea
 * visually dissolved into the next one. The opposite failure is just as bad: a
 * different colour per section reads as several different websites stitched
 * together. Five tones, each built from the SAME tokens at different
 * densities, is enough to separate the argument into chapters while keeping
 * one identity.
 *
 * | tone      | where                          | what it does                    |
 * | origin    | hero                           | nothing added, aurora at full   |
 * | measure   | the finite day, goal to plan   | calibration grid, cool lift     |
 * | focus     | execution, the week, real app  | deepest; product UI is the light|
 * | system    | the loop, everything together  | widest; brand glow returns      |
 * | close     | proof, questions, price        | calmest; the decision is left   |
 */
export type ChapterTone = 'origin' | 'measure' | 'focus' | 'system' | 'close'

interface ChapterProps {
  tone: ChapterTone
  children: ReactNode
  /** Anchor target, for in-page links. */
  id?: string
  /** id of the heading that names this chapter, for the landmark. */
  labelledBy?: string
  /**
   * Skip the large vertical padding.
   *
   * For the hero, which sizes itself to the viewport, and for any chapter that
   * paints its own full-bleed panel edge to edge.
   */
  flush?: boolean
  className?: string
}

/**
 * One chapter of the page: a scene, a spacing tier, and its content.
 *
 * ── WHY THE SCENE IS A CHILD AND NOT A BACKGROUND ON THE SECTION ───────────
 *
 * `.chapter__scene` is an absolutely positioned sibling of the content at
 * `z-index: -1`, inside an `isolate` stacking context. That is what lets a tone
 * MODULATE the page-wide aurora rather than replace it: the aurora is `fixed`
 * behind everything, the scene sits between it and the copy, and the result is
 * the same world seen under different light.
 *
 * Painting the tone directly on the section would have covered the aurora
 * completely, which is how a page ends up looking like stacked coloured bands.
 *
 * The scene also fades its own top and bottom edges (see `index.css`), so two
 * adjacent tones cross-dissolve over about 120px instead of meeting at a line.
 * Transitions are part of the system rather than something bolted on after.
 */
export function Chapter({
  tone,
  children,
  id,
  labelledBy,
  flush = false,
  className,
}: ChapterProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        'chapter relative',
        `chapter--${tone}`,
        !flush && 'chapter-pad',
        id && 'scroll-mt-20',
        className,
      )}
    >
      {/* Decorative and inert: it carries no information a screen reader
          needs, and the heading order already expresses the structure. */}
      <span aria-hidden className="chapter__scene" />
      {children}
    </section>
  )
}

/**
 * A beat inside a chapter.
 *
 * Uses the SMALL spacing tier, which is the half of the fix that has nothing to
 * do with colour. Previously each of the eighteen sections paid the large tier
 * at both its top and its bottom, so two beats of one argument were spaced
 * exactly like two unrelated arguments — most of the page's height went into
 * that, and it is why nothing grouped.
 *
 * `first` drops the gap so a chapter's opening beat sits directly under the
 * chapter padding rather than adding to it.
 */
export function Beat({
  children,
  first = false,
  className,
}: {
  children: ReactNode
  first?: boolean
  className?: string
}) {
  return <div className={cn(!first && 'beat-gap', className)}>{children}</div>
}
