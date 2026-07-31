import { Flower2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { FeatureKey } from '@/types/database'

export interface WellnessConcept {
  key: FeatureKey
  title: string
  /** One honest line. Describes the IDEA — no health/benefit claims, no implying it works. */
  description: string
  icon: LucideIcon
}

/**
 * The "Focus & Calm" ideas that are STILL NOT USABLE, and therefore still honest
 * fake doors. Copy stays descriptive and avoids medical or health-benefit claims.
 *
 * Kept deliberately narrow. Breathwork (`/wellness/breathe`), the supplement
 * tracker (`/wellness/tracker`) and now SLEEP SOUNDS have SHIPPED, so offering a
 * "Notify me" for any of them would be dishonest and none is listed here.
 *
 * Sleep sounds left this list the day the noise tracks landed: white, pink and
 * brown are generated on the device from a formula, so there was never a file
 * to license and there is now something real to listen to. Guided meditation is
 * the last one standing, and for the reason that has not changed: the sessions
 * have to be spoken and recorded by a person, and nobody has recorded them.
 * That is the gap this fake door measures.
 */
export const WELLNESS_CONCEPTS: WellnessConcept[] = [
  {
    key: 'meditation',
    title: 'Guided meditation',
    description:
      'Short guided sessions to start the morning or wind down at night. The player is built; the sessions aren’t recorded yet.',
    icon: Flower2,
  },
]
