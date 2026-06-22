import { WELLNESS_CONCEPTS } from '../concepts'
import { InterestCard } from './InterestCard'

interface FocusCalmCardsProps {
  /** Where these cards are rendered, recorded on each intent (e.g. 'wellness' or 'landing'). */
  source: string
}

/**
 * The three "Focus & Calm" coming-soon concept cards. Shared by the in-app
 * Wellness page and the marketing landing teaser so both stay in lock-step.
 */
export function FocusCalmCards({ source }: FocusCalmCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {WELLNESS_CONCEPTS.map((concept) => (
        <InterestCard key={concept.key} concept={concept} source={source} />
      ))}
    </div>
  )
}
