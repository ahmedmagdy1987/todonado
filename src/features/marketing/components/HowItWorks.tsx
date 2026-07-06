import { cn } from '@/lib/utils'

interface Step {
  n: number
  title: string
  body: string
  img: string
  alt: string
}

// Real, unedited captures of the running app (scripts/generate-screenshots.mjs).
const STEPS: Step[] = [
  {
    n: 1,
    title: 'Capture with effort',
    body: 'Drop everything into your Inbox and tag each task with the minutes it really takes — one tap, or accept the smart suggestion. An estimate is the whole game.',
    img: '/shots/capture-desktop.png',
    alt: 'Capturing a task in Todonado with one-tap effort chips and a suggested estimate',
  },
  {
    n: 2,
    title: 'See what fits',
    body: 'The Today capacity meter sums your planned effort against your real hours and warns before you overcommit. Commit to a day you can actually finish.',
    img: '/shots/today-desktop.png',
    alt: 'The Todonado Today screen with an effort-aware capacity meter at 63% planned',
  },
  {
    n: 3,
    title: 'Focus & finish',
    body: 'Start a distraction-free, refresh-proof timer bound to a single task. Log interruptions, and let anything unfinished roll over — no guilt pile.',
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
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="how-it-works">
      <div className="mx-auto max-w-2xl text-center">
        <h2 id="how-it-works" className="font-display text-2xl font-bold sm:text-3xl">
          How Todonado works
        </h2>
        <p className="mt-3 text-text-muted">
          Three steps, one honest day. Real screens from the app — no mockups.
        </p>
      </div>

      <div className="mt-14 flex flex-col gap-16">
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
      <div className="mt-16 flex flex-col items-center gap-8 rounded-3xl border border-white/5 bg-surface/40 px-6 py-12 sm:flex-row sm:justify-center sm:gap-12">
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
            Todonado is a dark, mobile-first web app — add it to your home screen and it runs like a
            native app, no app store required. Plan on your laptop, execute on your phone.
          </p>
        </div>
      </div>
    </section>
  )
}
