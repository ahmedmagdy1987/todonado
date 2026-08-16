import { Reveal } from '../demo/Reveal'

interface QuoteBandProps {
  /** Verbatim. Never trimmed, never smoothed, never re-punctuated. */
  quote: string
  author: string
  /** Book or publication, with enough detail to be checked. */
  source: string
  /** One line connecting the idea to the feature that follows it. */
  bridge: string
}

/**
 * A slim attributed pull quote between two sections.
 *
 * ── THE RULES THIS COMPONENT EXISTS TO ENFORCE ─────────────────────────────
 *
 * `source` is REQUIRED, not optional, and that is the whole point of having a
 * component rather than hand-rolling each quote. An unattributed pull quote is
 * how a page ends up repeating something it read on a quote aggregator, and
 * every widely circulated productivity quotation checked for this page had at
 * least one popular rendering that was wrong in wording, in attribution, or in
 * both. Making the citation a required prop means the next person to add a
 * quote here has to have looked it up.
 *
 * `bridge` is required for the same reason: a quotation that does not lead
 * directly into something the product does is borrowed authority, which is
 * exactly the register this page is trying not to be in.
 *
 * Semantics are `figure` / `blockquote` / `figcaption` / `cite`, so the
 * attribution is attached to the quotation for a screen reader rather than
 * being a paragraph that merely sits underneath it.
 */
export function QuoteBand({ quote, author, source, bridge }: QuoteBandProps) {
  return (
    // A `div`, NOT a `section`. A pull quote between two sections is not itself
    // a section, and a `<section>` with no accessible name adds an unlabelled
    // region to the document outline for no benefit.
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <Reveal className="text-center">
        <figure>
          <blockquote>
            <p className="font-display text-xl font-semibold leading-[1.3] tracking-tight text-text-primary sm:text-2xl lg:text-3xl">
              &ldquo;{quote}&rdquo;
            </p>
          </blockquote>
          <figcaption className="mt-4 text-sm text-text-muted">
            {author},{' '}
            <cite className="not-italic font-medium text-text-primary/80">{source}</cite>
          </figcaption>
        </figure>
        <p className="mx-auto mt-6 max-w-lg text-sm leading-relaxed text-text-muted sm:text-base">
          {bridge}
        </p>
      </Reveal>
    </div>
  )
}
