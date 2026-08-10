import { Link } from 'react-router-dom'
import { Compass, Gauge, Users, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui'
import { MarketingHeader } from './components/MarketingHeader'
import { MarketingFooter } from './components/MarketingFooter'

interface AboutBlock {
  icon: LucideIcon
  heading: string
  body: string
}

const BLOCKS: AboutBlock[] = [
  {
    icon: Gauge,
    heading: 'What it is',
    body: 'Most to-do apps are endless lists. Todonado is different: you give each task a time estimate, and a live capacity meter shows what your day can realistically hold. You commit to a plan you can actually finish, and whatever slips moves to tomorrow.',
  },
  {
    icon: Users,
    heading: 'Who it is for',
    body: 'Freelancers, founders, students, and anyone working on their own who loses the day to an ever-growing list and wants a calmer, more honest way to plan it.',
  },
  {
    icon: Compass,
    heading: 'Our mission',
    body: 'To help you plan a realistic day, every day. We would rather you finish an honest plan than stare at an endless list. Write everything down, decide what fits today, and protect that decision.',
  },
]

export function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-text-primary">
      <MarketingHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            About Todonado
          </h1>
          <p className="mt-5 text-lg text-text-muted">
            Todonado is a daily command center for tasks, projects, and focus. It is built around a
            single idea: a good day starts with an honest plan of what actually fits.
          </p>

          <div className="mt-10 space-y-8">
            {BLOCKS.map(({ icon: Icon, heading, body }) => (
              <div key={heading} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h2 className="font-display text-lg font-semibold">{heading}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-text-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col gap-3 sm:flex-row">
            <Link to="/pricing">
              <Button size="lg" className="w-full sm:w-auto">
                See plans
              </Button>
            </Link>
            <Link to="/welcome">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Back to home
              </Button>
            </Link>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  )
}
