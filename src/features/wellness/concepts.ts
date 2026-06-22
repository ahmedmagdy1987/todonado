import { Flower2, Moon, Pill } from 'lucide-react'
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
 * The three "Focus & Calm" concepts we're validating. Every one is a COMING-SOON
 * idea — nothing is built. Copy stays descriptive and avoids medical or
 * health-benefit claims (esp. the tracker, which is a plain log, not advice).
 */
export const WELLNESS_CONCEPTS: WellnessConcept[] = [
  {
    key: 'meditation',
    title: 'Guided meditation & breathwork',
    description: 'Short guided sessions and breathing exercises to bookend your focus blocks.',
    icon: Flower2,
  },
  {
    key: 'sleep_sounds',
    title: 'Sleep sounds',
    description: 'Ambient soundscapes — white noise, rain, and thunderstorm — to play in the background.',
    icon: Moon,
  },
  {
    key: 'supplement_tracker',
    title: 'Supplement & medication tracker',
    description: 'A simple place to log the supplements, vitamins, and medications you take.',
    icon: Pill,
  },
]
