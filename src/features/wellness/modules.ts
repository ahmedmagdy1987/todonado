import { Flower2, Moon, Pill, Wind } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { FeatureKey } from '@/types/database'

/**
 * Registry for the Focus & Calm hub. As each module ships, flip its `status` to
 * 'live' and give it a `to` route — the hub then swaps the fake-door "Notify me"
 * card for a real entry point. Modules still 'soon' keep the insert-only
 * feature_intents fake-door (via `intentKey`).
 */
export interface WellnessModule {
  /** Stable id / route segment. */
  id: string
  title: string
  description: string
  icon: LucideIcon
  status: 'live' | 'soon'
  /** Route when live. */
  to?: string
  /** Fake-door interest key while still 'soon'. */
  intentKey?: FeatureKey
}

export const WELLNESS_MODULES: WellnessModule[] = [
  {
    id: 'breathe',
    title: 'Breathwork',
    description: 'A guided breathing pacer — Box, Calm (4-7-8), or Simple — with an optional end chime.',
    icon: Wind,
    status: 'live',
    to: '/wellness/breathe',
  },
  {
    id: 'sleep',
    title: 'Sleep sounds',
    description: 'Ambient soundscapes — white noise, rain, thunderstorm — with a sleep timer.',
    icon: Moon,
    status: 'live',
    to: '/wellness/sleep',
  },
  {
    id: 'meditate',
    title: 'Guided meditation',
    description: 'Short guided sessions to start the morning or wind down at night.',
    icon: Flower2,
    status: 'live',
    to: '/wellness/meditate',
  },
  {
    id: 'tracker',
    title: 'Supplement & medication tracker',
    description: 'A simple personal log of what you take — mark it taken and keep a streak.',
    icon: Pill,
    status: 'live',
    to: '/wellness/tracker',
  },
]
