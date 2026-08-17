import { Reveal } from '../demo/Reveal'

/**
 * THE TWO OUTSIDE SOURCES, KEPT WHOLE AND KEPT SMALL.
 *
 * ── WHY THEY LIVE HERE NOW ─────────────────────────────────────────────────
 *
 * Both were inside `SystemLoop`, which is off the homepage: its argument ("the
 * system learns from what really happened") is now made in words at the top of
 * the page and proved by the product further down, so keeping a 900px animated
 * section to make it a third time was the page's largest remaining redundancy.
 *
 * These two things could not go with it. A verbatim, correctly attributed
 * quotation and a real peer-reviewed finding are the only claims on this page
 * that come from outside the product, and they are load-bearing in a way the
 * animation was not: the whole premise is that your first estimate will be
 * wrong, and this is the evidence for that premise.
 *
 * ── NOTHING ABOUT EITHER CLAIM WAS WEAKENED TO MAKE IT FIT ─────────────────
 *
 * The quotation is verbatim, still attributed to the book AND chapter, still
 * marked up as `figure`/`blockquote`/`cite` so the attribution is attached to
 * the quotation rather than merely sitting near it. The finding is still the
 * authors' own four-study summary and still linked by DOI.
 *
 * The citation link gets its own line. That is an accessibility fix, not a
 * layout preference: inline at the end of a sentence it measured 195x40, under
 * the 44px touch floor, and the `tap-h-44` utility cannot rescue a link inside
 * flowing text because its pseudo-element band lands on the lines above and
 * below. On its own line there is nothing to collide with.
 *
 * They are deliberately UNDER the product proof, not above it. Research
 * supports the story; it is not the story, and a landing page that opens with
 * a citation is arguing rather than showing.
 */
export function ProofNotes() {
  return (
    <Reveal>
      <div className="mx-auto grid max-w-4xl gap-8 border-t border-white/8 pt-8 sm:grid-cols-2 sm:gap-12">
        <figure>
          <blockquote>
            <p className="text-balance text-sm italic leading-relaxed text-text-primary/80 sm:text-base">
              &ldquo;You do not rise to the level of your goals. You fall to the level of your
              systems.&rdquo;
            </p>
          </blockquote>
          <figcaption className="mt-2 text-xs text-text-muted">
            James Clear,{' '}
            <cite className="font-medium not-italic text-text-primary/70">Atomic Habits</cite>,
            chapter 1
          </figcaption>
        </figure>

        <div>
          <p className="text-sm leading-relaxed text-text-muted">
            It is not just you. Across four studies, fewer than half of participants finished their
            tasks in the amount of time they originally predicted.
          </p>
          <a
            href="https://doi.org/10.1037/0022-3514.67.3.366"
            target="_blank"
            rel="noreferrer noopener"
            title="Buehler, R., Griffin, D., &amp; Ross, M. (1994). Exploring the &quot;planning fallacy&quot;: Why people underestimate their task completion times. Journal of Personality and Social Psychology, 67(3), 366-381."
            className="focus-ring mt-1 inline-flex min-h-[44px] items-center rounded text-xs text-text-muted underline decoration-white/25 underline-offset-4 hover:text-text-primary"
          >
            Buehler, Griffin &amp; Ross (1994)
          </a>
        </div>
      </div>
    </Reveal>
  )
}
