import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Moon, Pill, Wind, type LucideIcon} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'
import { InterestCard } from '@/features/wellness/components/InterestCard'
import { WELLNESS_CONCEPTS } from '@/features/wellness/concepts'
import { Reveal } from '../demo/Reveal'
import { SECTION_RHYTHM } from '../sectionRhythm'

interface LiveModule {
  title: string
  description: string
  icon: LucideIcon
  to: string
}

/**
 * SHIPPED and fully usable today — so these link into the real thing rather than
 * capturing interest.
 *
 * Sleep sounds joined this list when the noise tracks shipped: white, pink and
 * brown are generated on the device, so there was never a file to license.
 * Guided meditation is the only one left below, because its sessions still have
 * to be spoken and recorded by a person (see WELLNESS_CONCEPTS).
 */
const LIVE_MODULES: LiveModule[] = [
  {
    title: 'Breathwork',
    description:
      'A guided breathing pacer. Box, Calm (4-7-8), or Simple, with an optional end chime.',
    icon: Wind,
    to: '/wellness/breathe',
  },
  {
    title: 'Sleep sounds',
    description:
      'White, pink and brown noise, generated on your device, with a sleep timer. No download.',
    icon: Moon,
    to: '/wellness/sleep',
  },
  {
    title: 'Supplement & medication tracker',
    description:
      'A simple personal log of what you take. Mark it taken and keep a streak. Not medical advice.',
    icon: Pill,
    to: '/wellness/tracker',
  },
]

/** Small numbers read better as words in a sentence than as digits. */
function countWord(n: number): string {
  return ['no', 'One', 'Two', 'Three', 'Four', 'Five'][n] ?? String(n)
}

export function WellnessTeaser() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  /**
   * Signed in → straight into the module. Logged out → signup, carrying the
   * destination in `from` so LoginPage lands them there once the session exists
   * (the same mechanism ProtectedRoute uses), instead of dumping them on Today.
   */
  function open(to: string) {
    if (session) {
      navigate(to)
      return
    }
    navigate('/login', {
      state: {
        ...((location.state as object | null) ?? {}),
        mode: 'signup',
        from: { pathname: to },
      },
    })
  }

  return (
    // Background removed: the enclosing chapter's scene provides it.
    <section aria-labelledby="focus-calm">
      <div className={cn(SECTION_RHYTHM, 'max-w-6xl')}>
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 id="focus-calm" className="font-display text-2xl font-bold sm:text-3xl">
            A calmer side to your day
          </h2>
          <p className="mt-3 text-text-muted">
            {/*
              THE COUNT IS COMPUTED, NOT TYPED, because the typed one was wrong.
              This read "Two of these are built... Two aren't" while the page
              rendered THREE live modules and ONE unbuilt concept, so anyone who
              counted the cards caught the page contradicting itself.
              `e2e/marketing.spec.ts` had already pinned the truth from the other
              side: it asserts exactly one "Coming soon" badge on the landing.

              Deliberate wording: that same spec fails if the strings "not built
              yet" or "isn't built" appear within 90 characters of a shipped
              feature name, and Breathwork is the very next word on the page.
              Saying what the last one still NEEDS is both truer and safer than
              saying what it is not.
            */}
            {countWord(LIVE_MODULES.length)} of these are free to use right now.
          </p>
        </Reveal>

        {/*
          THREE LINKS, NOT THREE ROWS OF DESCRIPTION.

          Every one of these modules is ALREADY named in the breadth list a few
          hundred pixels above: breathwork and the sleep noise under Calm, the
          supplement log under Habits. Describing them a second time, in full,
          is the same duplication the "everything else" list was cut for.

          The DESTINATIONS are what this block uniquely provides, so they all
          survive as links; only the second description of each is gone. The
          fake door keeps its card, because it is the one thing here that is not
          usable yet and giving it a different shape from the three that are is
          the honest way to say so.
        */}
        <ul className="mt-6 flex flex-wrap justify-center gap-2 sm:mt-8 sm:gap-3">
          {LIVE_MODULES.map(({ icon: Icon, title, description, to }) => (
            <li key={to}>
              {/* The description is no longer rendered as a second copy of what
                  the breadth list already says, but it is still the best
                  one-line explanation of each module, so it becomes the
                  tooltip rather than being deleted. */}
              <button
                type="button"
                onClick={() => open(to)}
                aria-label={`Open ${title}`}
                title={description}
                className="focus-ring lift-card inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/10 bg-surface/60 px-4 text-sm text-text-primary hover:border-brand/25"
              >
                <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                {title}
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        {/*
          THE UNBUILT ONE IS SEPARATED, LABELLED, AND EXPLAINED IN PLACE.

          Compressing the three live modules into chips put "Sleep sounds"
          directly above a "Coming soon" badge, close enough that a reader
          scanning the block could take the badge to apply to the whole group.
          `e2e/marketing.spec.ts` caught it, and it was a real reading problem
          rather than a test artefact: the guard exists precisely because a
          shipped feature sitting next to an unbuilt label is a lie by layout.

          The explanation used to live in the intro paragraph, three lines above
          the thing it described. It belongs here, next to it, which fixes the
          proximity and reads better.
        */}
        <div className="mx-auto mt-8 max-w-md border-t border-white/5 pt-8">
          <p className="mb-4 text-center text-sm text-text-muted">
            Guided meditation still needs a person to record the sessions. Tell us if you&rsquo;d
            use it and we&rsquo;ll email you when it&rsquo;s ready.
          </p>
          {WELLNESS_CONCEPTS.map((concept, i) => (
            <Reveal key={concept.key} delay={(LIVE_MODULES.length + i) * 70} className="h-full">
              <InterestCard concept={concept} source="landing" />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
