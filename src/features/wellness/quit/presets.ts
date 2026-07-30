import { Circle, Cookie, EyeOff, Wind, Wine } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * The quit presets and the "do this instead" suggestions.
 *
 * NAMING RULE — read this before adding one. Every label names the BEHAVIOUR
 * in plain, clinical-neutral words and nothing else. No "bad habit", no
 * "addiction", no "vice", no "clean/dirty" framing on the categories, no
 * warning-label iconography (no skulls, no crossed-out symbols, no red). The
 * user already knows what they think about the habit; the app's job is to
 * count days, not to add a verdict. A label a user would be embarrassed to see
 * on their own screen is the wrong label.
 */

export interface QuitPreset {
  /** Stored in quit_habits.preset_key. Stable — never rename an existing key. */
  key: string
  /** Default habit name; the user can overwrite it freely. */
  label: string
  icon: LucideIcon
}

export const QUIT_PRESETS: QuitPreset[] = [
  { key: 'unhealthy_eating', label: 'Unhealthy eating', icon: Cookie },
  { key: 'smoking', label: 'Smoking or vaping', icon: Wind },
  { key: 'adult_content', label: 'Adult content', icon: EyeOff },
  { key: 'alcohol', label: 'Alcohol', icon: Wine },
  { key: 'custom', label: 'Something else', icon: Circle },
]

const PRESET_BY_KEY = new Map(QUIT_PRESETS.map((p) => [p.key, p]))

/** Look up a preset, falling back to the neutral custom one for unknown keys. */
export function presetFor(key: string | null | undefined): QuitPreset {
  return (key && PRESET_BY_KEY.get(key)) || QUIT_PRESETS[QUIT_PRESETS.length - 1]
}

/**
 * Replacement actions — the "do this instead" mechanic.
 *
 * `replacement_action` is free text in the database (the client never parses
 * user prose). These are only SUGGESTION CHIPS: picking one writes its exact
 * `text`, and because the picker and the resolver below share this one array,
 * a suggestion that deep-links can never drift from the string it wrote.
 * Anything the user types themselves simply renders as text with no link —
 * which is the honest outcome, not a degraded one.
 */
export interface ReplacementSuggestion {
  /** Exactly what gets stored in replacement_action. */
  text: string
  /** In-app route this action maps to, when one exists. */
  to?: string
}

export const REPLACEMENT_SUGGESTIONS: ReplacementSuggestion[] = [
  { text: 'Breathe for 60 seconds', to: '/wellness/breathe' },
  { text: 'Go for a short walk' },
  { text: 'Drink a glass of water' },
  { text: 'Step outside for two minutes' },
  { text: 'Start a focus session', to: '/focus' },
]

/**
 * The route a stored replacement action deep-links to, or null.
 * An exact match against the suggestions above — never a fuzzy or substring
 * match, so a user whose own text happens to contain "walk" is not silently
 * given a link they didn't ask for.
 */
export function replacementLink(action: string | null | undefined): string | null {
  if (!action) return null
  return REPLACEMENT_SUGGESTIONS.find((s) => s.text === action)?.to ?? null
}
