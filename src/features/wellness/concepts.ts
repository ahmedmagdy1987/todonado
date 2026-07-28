import { Flower2, Moon } from 'lucide-react'
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
 * Kept deliberately narrow. Breathwork (`/wellness/breathe`) and the supplement
 * tracker (`/wellness/tracker`) have SHIPPED — they are fully working features,
 * so offering a "Notify me" for them would be dishonest and they are no longer
 * listed here. What remains is the audio pair: the players are built, but
 * `AUDIO_TRACKS` ships every track with an empty `src` (no licensed audio in the
 * repo — see public/audio/README.md), so from a visitor's point of view there is
 * nothing to listen to yet. That is the gap this fake door measures.
 */
export const WELLNESS_CONCEPTS: WellnessConcept[] = [
  {
    key: 'sleep_sounds',
    title: 'Sleep sounds',
    description:
      'Ambient soundscapes — white noise, rain, ocean — with a sleep timer. The player is built; the audio isn’t licensed yet.',
    icon: Moon,
  },
  {
    key: 'meditation',
    title: 'Guided meditation',
    description:
      'Short guided sessions to start the morning or wind down at night. The player is built; the sessions aren’t recorded yet.',
    icon: Flower2,
  },
]
