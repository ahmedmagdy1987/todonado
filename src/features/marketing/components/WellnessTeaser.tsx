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
            Two of these are built and free to use right now. Two aren&rsquo;t. Tell us if
            you&rsquo;d actually use them and we&rsquo;ll let you know when they land.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LIVE_MODULES.map(({ icon: Icon, title, description, to }, i) => (
            <Reveal key={to} delay={i * 70} className="h-full">
              <Card className="h-full ring-1 ring-brand/20">
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <Badge variant="brand">Live</Badge>
                  </div>
                  <h3 className="font-display text-base font-semibold">{title}</h3>
                  <p className="text-sm text-text-muted">{description}</p>
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
