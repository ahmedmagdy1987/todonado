import { cn } from '@/lib/utils'
import { SECTION_RHYTHM } from '../sectionRhythm'

/**
 * THE REAL APP, ONCE.
 *
 * ── WHY THIS WAS THREE SECTIONS AND IS NOW ONE ─────────────────────────────
 *
 * This used to be a three-step walkthrough: capture, see what fits, focus and
 * finish, each with a full-width desktop capture. It was the tallest thing on
 * the page by a wide margin (about 2,000px on a phone) and every one of those
 * three beats had ALREADY been demonstrated above it by a live widget running
 * the product's real logic. A visitor had just added tasks to a working
 * capacity meter and watched a real planner fill a day; being shown static
 * pictures of the same three ideas afterwards is a re-explanation, and a long
 * one, at the exact point in the page where momentum matters most.
 *
 * What the screenshots ARE uniquely good for is the one thing no widget on a
 * marketing page can prove: that the real product has real chrome and looks
 * like this. That needs one image, not three.
 *
 * The phone stays because it answers an objection nothing else on the page
 * answers ("does this work on my phone, and do I have to install something?"),
 * and because it is the only place the no-app-store fact is stated.
 */

function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 shadow-elevation-lg ring-1 ring-white/5">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        width={1280}
        height={820}
        className="h-auto w-full"
      />
    </div>
  )
}

export function HowItWorks() {
  return (
    <section className={cn(SECTION_RHYTHM, 'max-w-6xl')} aria-labelledby="how-it-works">
      <div className="mx-auto max-w-2xl text-center">
        <h2 id="how-it-works" className="font-display text-2xl font-bold sm:text-3xl">
          This is the actual app
        </h2>
        <p className="mt-3 text-text-muted">
          Not a mockup and not a marketing render. Unedited captures of the thing you get.
        </p>
      </div>

      {/* The desktop capture gets the lion's share of the width on purpose. A
          screenshot small enough that its own UI text is unreadable proves
          nothing, and this is the only section whose entire job is "look at
          the real thing". */}
      <div className="mt-10 grid items-center gap-8 sm:mt-12 lg:grid-cols-[1.75fr_1fr] lg:gap-12">
        <Shot
          src="/shots/today-desktop.png"
          alt="The Todonado Today screen showing the capacity meter at 63% planned"
        />

        {/* The phone, beside the desktop rather than in its own panel below it:
            one composition showing both places the product runs, instead of two
            sections making the same point one after the other. */}
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8 lg:flex-col lg:items-start">
          <div className="w-[150px] shrink-0 overflow-hidden rounded-[1.75rem] border-4 border-surface-2 shadow-elevation-lg sm:w-[180px]">
            <img
              src="/shots/today-mobile.png"
              alt="Todonado running on a phone, showing the Today capacity meter and task list"
              loading="lazy"
              decoding="async"
              width={390}
              height={844}
              className="h-auto w-full"
            />
          </div>
          <div className="max-w-sm text-center sm:text-left">
            <h3 className="font-display text-lg font-semibold sm:text-xl">
              Plan on your laptop. Work from your phone.
            </h3>
            <p className="mt-2 text-sm text-text-muted sm:text-base">
              Add it to your home screen and it opens like any other app. Nothing to download, and
              the same account either way.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
