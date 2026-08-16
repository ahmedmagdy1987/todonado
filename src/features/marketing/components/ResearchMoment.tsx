import { Reveal } from '../demo/Reveal'

/**
 * THE ONE RESEARCH CLAIM ON THE PAGE.
 *
 * ── THE CLAIM THIS SECTION ORIGINALLY MADE WAS WRONG, AND THAT IS WHY IT IS
 *    DOCUMENTED HERE RATHER THAN QUIETLY REPLACED ──────────────────────────
 *
 * The first draft cited implementation intentions ("deciding in advance WHEN
 * AND WHERE you will act improves follow-through"). An adversarial check killed
 * it on two independent grounds, either of which would have been enough:
 *
 *   1. It misstates the comparison. In that literature a "schedule plan" is
 *      already defined as naming when, where and what. So the effect is if-then
 *      cue-response plans beating schedule plans, NOT planning beating not
 *      planning. Todonado schedules; it does not build if-then cues. Citing it
 *      would have been an argument AGAINST this product, dressed up as support.
 *   2. The 2025 meta-analysis (642 tests) reports d = .36 with Egger's b = 1.06,
 *      i.e. substantial publication bias, and a bias-corrected estimate of
 *      d = .15 that the authors themselves call small.
 *
 * The finding below replaced it because it is about the thing the product
 * actually does: estimating how long your own work will take.
 *
 * ── WHAT IS CLAIMED, AND WHY IN THESE EXACT WORDS ──────────────────────────
 *
 * The sentence rendered below is the authors' OWN summary from the General
 * Discussion (p. 378): "In each case, fewer than one half of the participants
 * finished their tasks in the amount of time they originally predicted." It
 * summarises four prospective studies, so it is the most robust sentence in the
 * paper and the least dependent on any single sample.
 *
 * Deliberately NOT used, though all were verified:
 *   - the thesis figures (33.9 predicted vs 55.5 actual days). Real, but they
 *     belong to 37 psychology students at one university in 1994, and quoting
 *     them invites a reader to think the paper says everyone doubles everything
 *   - "83.5% certain, 43.6% finished". Real, but from a single study
 *   - the widely circulated 13/19/45% probability figures. These are routinely
 *     attributed to this paper and DO NOT APPEAR IN IT; they belong to a
 *     different 1995 paper. That misattribution is exactly the trap this
 *     section is written to avoid
 *
 * Known counter-argument, recorded rather than hidden: a 2025 Cambridge
 * handbook chapter argues the planning fallacy is over-extended as an
 * explanation for large-project cost overruns. That critique is about
 * megaproject economics; the claim here is the narrow, directly-measured one
 * about individuals predicting their own task times, which is what the 1994
 * studies observed.
 *
 * Full register, including everything rejected: docs/HOMEPAGE_V2_CLAIMS.md
 */

const SOURCE = {
  citation:
    'Buehler, R., Griffin, D., & Ross, M. (1994). Exploring the "planning fallacy": Why people underestimate their task completion times. Journal of Personality and Social Psychology, 67(3), 366-381.',
  short: 'Buehler, Griffin & Ross (1994), Journal of Personality and Social Psychology',
  href: 'https://doi.org/10.1037/0022-3514.67.3.366',
} as const

export function ResearchMoment() {
  return (
    <section
      className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16"
      aria-labelledby="research"
    >
      <Reveal>
        <div className="rounded-3xl border border-white/5 bg-surface/40 px-5 py-9 text-center sm:px-10 sm:py-10">
          <h2
            id="research"
            className="font-mono text-xs uppercase tracking-[0.2em] text-accent"
          >
            Everyone is bad at this
          </h2>

          <p className="mx-auto mt-5 max-w-2xl font-display text-lg font-semibold leading-[1.4] sm:text-2xl">
            Across four studies, fewer than half of participants finished their tasks in the amount
            of time they originally predicted.
          </p>

          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-text-muted">
            It was not only big projects. The same pattern showed up on ordinary jobs like fixing a
            bike or cleaning a flat. Underestimating your own work is normal, which is why guessing
            harder does not fix it.
          </p>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-text-primary/90">
            So Todonado keeps the receipts. It records how long things actually took and compares
            that with what you guessed, so your next estimate has something real behind it.
          </p>

          {/* `min-h-[44px]` + `inline-flex`: a 31px-tall citation link is a
              miss you feel rather than see on a phone. The text stays the size
              it is; only the touchable box grows. */}
          <p className="mt-4 text-xs text-text-muted">
            <a
              href={SOURCE.href}
              target="_blank"
              rel="noreferrer noopener"
              className="focus-ring inline-flex min-h-[44px] items-center rounded px-2 underline decoration-white/25 underline-offset-4 hover:text-text-primary"
              title={SOURCE.citation}
            >
              {SOURCE.short}
            </a>
          </p>
        </div>
      </Reveal>
    </section>
  )
}
