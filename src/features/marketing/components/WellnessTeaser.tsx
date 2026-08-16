import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Moon, Pill, Wind, type LucideIcon} from 'lucide-react'
import { Badge, Button, Card, CardContent } from '@/components/ui'
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
    <section className="border-y border-white/5 bg-surface/30" aria-labelledby="focus-calm">
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
            {countWord(LIVE_MODULES.length)} of these are free to use right now. The last one
            still needs recording. Tell us if you&rsquo;d use it and we&rsquo;ll email you when
            it&rsquo;s ready.
          </p>
        </Reveal>

        {/*
          TWO ACROSS ON A PHONE.

          Four full-width cards was most of three phone screens for a section
          that is deliberately secondary: the Calm group in the breadth strip
          above has already named breathwork and the sleep noise, so this
          section's real job is the one thing that strip cannot do, which is
          carry the fake door for the module that is not built. Halving the
          column count halves the cost of saying it.
        */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:gap-4 lg:grid-cols-4">
          {LIVE_MODULES.map(({ icon: Icon, title, description, to }, i) => (
            <Reveal key={to} delay={i * 70} className="h-full">
              <Card className="h-full ring-1 ring-brand/20">
                <CardContent className="flex h-full flex-col gap-2.5 p-4 sm:gap-3 sm:p-5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand sm:h-9 sm:w-9">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <Badge variant="brand">Live</Badge>
                  </div>
                  <h3 className="font-display text-sm font-semibold sm:text-base">{title}</h3>
                  <p className="text-xs text-text-muted sm:text-sm">{description}</p>
                  <div className="mt-auto pt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => open(to)}
                      aria-label={`Open ${title}`}
                    >
                      {session ? 'Open' : 'Try it free'}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Reveal>
          ))}

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
