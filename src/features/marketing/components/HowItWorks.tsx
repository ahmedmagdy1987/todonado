import { cn } from '@/lib/utils'
import { SECTION_RHYTHM } from '../sectionRhythm'

interface Step {
  n: number
  title: string
  body: string
  img: string
  alt: string
}

// Real, unedited captures of the running app (scripts/generate-screenshots.mjs).
// Copy is deliberately one line per step: the live widgets above already made
// the argument, so this section is PROOF (real screens), not a re-explanation.
const STEPS: Step[] = [
  {
    n: 1,
    title: 'Add the task and the time',
    body: 'One tap adds how many minutes it will really take.',
    img: '/shots/capture-desktop.png',
    alt: 'Adding a task in Todonado with one-tap time estimates',
  },
  {
    n: 2,
    title: 'See what fits',
    body: 'It adds up your tasks and shows what fits in your real hours, before you commit.',
    img: '/shots/today-desktop.png',
    alt: 'The Todonado Today screen showing the capacity meter at 63% planned',
  },
  {
    n: 3,
    title: 'Focus & finish',
    body: 'A timer locked to one task that keeps running if you close the page. Anything you don’t finish moves to tomorrow.',
    img: '/shots/focus-desktop.png',
    alt: 'A Todonado focus session running a distraction-free timer on one task',
  },
]

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
          How Todonado works
        </h2>
        <p className="mt-3 text-text-muted">
          Three steps, shown in the real app. Real screenshots, nothing staged.
        </p>
      </div>

      <div className="mt-12 flex flex-col gap-12 sm:gap-14">
        {STEPS.map((step, i) => (
          <div
            key={step.n}
            className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12"
          >
            {/* Text — alternate sides on desktop; always first on mobile. */}
            <div className={cn(i % 2 === 1 && 'lg:order-2')}>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-sm font-bold text-white">
                {step.n}
              </span>
              <h3 className="mt-4 font-display text-xl font-semibold sm:text-2xl">{step.title}</h3>
              <p className="mt-3 max-w-md text-text-muted">{step.body}</p>
            </div>
            <div className={cn(i % 2 === 1 && 'lg:order-1')}>
              <Shot src={step.img} alt={step.alt} />
            </div>
          </div>
        ))}
      </div>

      {/* Mobile / PWA showcase — uses the real 390px capture. */}
      <div className="mt-12 flex flex-col items-center gap-8 rounded-3xl border border-white/5 bg-surface/40 px-6 py-10 sm:flex-row sm:justify-center sm:gap-12">
        <div className="w-[220px] shrink-0 overflow-hidden rounded-[2rem] border-4 border-surface-2 shadow-elevation-lg">
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
          <h3 className="font-display text-xl font-semibold">Your command center, in your pocket</h3>
          <p className="mt-3 text-text-muted">
            Add it to your home screen and it opens like any other app. No app store. Plan on your
            laptop, work from your phone.
          </p>
        </div>
      </div>
    </section>
  )
}
