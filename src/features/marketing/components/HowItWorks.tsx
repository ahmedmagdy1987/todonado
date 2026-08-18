import { cn } from '@/lib/utils'

/**
 * THE LOOP, IN THREE STEPS AND ABOUT ONE SCREEN.
 *
 * ── IT USES REAL SCREENSHOTS, AND THEY ARE THE SAME DAY ────────────────────
 *
 * `public/shots/today-desktop.png` and `focus-desktop.png` are real captures of
 * the running app, and they were taken together: the task being focused in the
 * second image ("Make the bed and open the blinds") is a row in the first. That
 * is the entire argument of this section, made without a sentence, and it is
 * why these two shots are worth more than any diagram of the loop.
 *
 * They sat unused in the repo. A product that never shows its own interface
 * reads as a product that is not finished.
 *
 * ── THE THIRD STEP IS DOM, AND SAYS WHAT IT IS ─────────────────────────────
 *
 * There is no Insights capture in the repo, so step three is a compact
 * reconstruction using the panel names Insights actually uses ("Estimation
 * accuracy", "Planned vs completed effort"). It is drawn rather than
 * photographed, so it is deliberately schematic rather than pretending to be a
 * screenshot: no chrome, no window frame, no invented chart.
 *
 * ── HEIGHT DISCIPLINE ──────────────────────────────────────────────────────
 *
 * Both images carry explicit `width`/`height` so they reserve their space and
 * cannot shift the layout, and both are `loading="lazy"`. They are cropped from
 * the top rather than scaled down whole: a full desktop screen shrunk to fit a
 * phone is a smudge, so the visible part stays legible and the rest is simply
 * not shown.
 */

interface Step {
  label: string
  title: string
  body: string
}

export const STEPS: readonly Step[] = [
  {
    label: 'Plan',
    title: 'See what actually fits',
    body: 'Give the day a capacity, put minutes on the work, and let the meter tell you the truth before you commit to it.',
  },
  {
    label: 'Do',
    title: 'Work the plan, not the list',
    body: 'Start a focus session on a task you already planned. Interruptions get counted instead of quietly ending the session.',
  },
  {
    label: 'Learn',
    title: 'Let today correct tomorrow',
    body: 'The time you planned and the time you spent end up side by side, so the next estimate is better than the last one.',
  },
] as const

/**
 * A product capture, already cropped to exactly what is shown.
 *
 * ── WHY THE FILES ARE CROPS AND NOT THE FULL SCREENS ───────────────────────
 *
 * `today-desktop.png` and `focus-desktop.png` are 2x captures of a 1280px
 * viewport, and they weigh 250 kB and 163 kB. This section displays a 356x220
 * CSS window of each, which is 712x440 source pixels: about 8% of the file. The
 * first version positioned the full image with a negative offset inside an
 * `overflow-hidden` box, which looked right and made every visitor download
 * 413 kB of pixels that were never on screen.
 *
 * `today-plan.png` and `focus-session.png` are those exact windows, cut with no
 * resampling, so the surviving pixels are identical to the originals. Together
 * they are 59 kB. The full-screen masters stay in `public/shots/` because they
 * are what any future crop is cut from.
 *
 * ── STILL NATIVE SIZE, STILL NOT SHRUNK ────────────────────────────────────
 *
 * The point of cropping rather than scaling is unchanged: a whole desktop
 * screen squeezed into a 356px column renders every label at 28% and becomes a
 * smudge. What a reader sees here is a real window onto the real interface at
 * the size the app draws it.
 *
 * Explicit `width`/`height` reserve the space, so a lazily-loaded image can
 * never shift the layout.
 */
function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    /*
     * THE BOX AND THE FILE SHARE ONE ASPECT RATIO, AND THAT IS THE FIX.
     *
     * These were fixed-height boxes (132px on a phone, 220px above it) holding
     * an image of a different shape, so `object-cover` threw away whatever did
     * not fit. On a phone that was 38% off the bottom: the timer ring was
     * beheaded and its "05:00" disappeared entirely, and the capacity card's
     * numbers were sliced horizontally through the glyphs. It read as a broken
     * product directly beneath a caption promising "the screens below are the
     * real app".
     *
     * The crops are now cut to exactly what should be seen, at 712x580 device
     * pixels, and the box is `aspect-[520/300]`, which is the same ratio. So
     * every width shows the whole crop and nothing is ever sliced.
     */
    <div className="relative aspect-[520/300] w-full overflow-hidden rounded-xl border border-white/10 bg-background">
      <img
        src={src}
        alt={alt}
        width={520}
        height={300}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover object-left-top"
      />
      {/* Both cut edges continue off screen; fading them says so rather than
          leaving a hard line that reads as a truncated or broken screenshot. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-background via-background/70 to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background via-background/60 to-transparent"
      />
    </div>
  )
}

export function HowItWorks({ className }: { className?: string }) {
  return (
    <div className={cn('grid gap-5 sm:grid-cols-3', className)}>
      {STEPS.map((step, index) => (
        <div key={step.label} className="flex flex-col">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-xs tracking-[0.18em] text-brand">
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className="font-display text-lg font-semibold text-text-primary">{step.title}</h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>

          <div className="mt-3.5">
            {index === 0 && (
              <Shot
                src="/shots/today-plan.png"
                alt="The Day Capacity meter on the Today screen, showing 1h 35m planned"
              />
            )}
            {index === 1 && (
              <Shot
                src="/shots/focus-session.png"
                alt="A focus session running on a task that was planned for today"
              />
            )}
            {index === 2 && <LearnPanel />}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * A compact stand-in for the Insights panels, drawn in DOM.
 *
 * The numbers are illustrative and the panel says so by being obviously a
 * diagram rather than a capture. What is NOT invented is the vocabulary: both
 * labels are the real panel names inside Insights.
 */
function LearnPanel() {
  const rows = [
    { label: 'Planned', minutes: 330, width: '66%', tone: 'bg-brand-gradient' },
    { label: 'Actual', minutes: 415, width: '83%', tone: 'bg-warning' },
  ]
  return (
    <div className="flex aspect-[520/300] w-full flex-col justify-center rounded-xl border border-white/10 bg-background p-4 sm:p-5">
      <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
        Planned vs completed effort
      </p>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-text-primary">{row.label}</span>
              <span className="font-mono text-text-muted">
                {Math.floor(row.minutes / 60)}h {row.minutes % 60}m
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className={cn('h-full rounded-full', row.tone)} style={{ width: row.width }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-white/[0.07] pt-3 text-xs text-text-muted">
        Estimation accuracy, over your last few weeks
      </p>
    </div>
  )
}
