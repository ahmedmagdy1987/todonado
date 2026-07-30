import type { Project, VisionCard } from '@/types/database'
import { isBeforeDay } from '@/lib/date'

/**
 * Pure logic for the Vision page. No React, no I/O — unit-tested.
 *
 * There is deliberately very little of it. A vision card is a title, a reason
 * and an optional date; the app's job is to keep them in the order the user
 * chose and to say when one is linked to a project. Anything cleverer (scoring
 * goals, nagging about dates, "you're behind on this") would be the app forming
 * an opinion about someone's life, which is not what this page is for.
 */

/** Mirrors the DB CHECKs in 20260730140000_vision_cards.sql. */
export const MAX_VISION_TITLE = 80
export const MAX_VISION_WHY = 500

/** The user's chosen order: position, then creation time as a stable tiebreak. */
export function sortVisionCards(cards: VisionCard[]): VisionCard[] {
  return cards.slice().sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * The position a NEW card gets: after everything that exists.
 * Matches how the rest of the app appends (one more than the largest position),
 * so a new goal lands at the bottom rather than jumping to the top of a list the
 * user has arranged.
 */
export function nextVisionPosition(cards: VisionCard[]): number {
  if (cards.length === 0) return 0
  return Math.max(...cards.map((c) => c.position)) + 1
}

/**
 * May this user create ANOTHER vision card?
 * Asked about creation only — everything already written keeps working.
 */
export function canCreateVisionCard(
  currentCount: number,
  isPro: boolean,
  limit: number,
): boolean {
  if (isPro) return true
  return currentCount < limit
}

export type ValidationResult = { ok: true } | { ok: false; error: string }

/** Validate before it reaches the database, mirroring the DB CHECKs. */
export function validateVisionCard(draft: { title: string; why: string | null }): ValidationResult {
  const title = draft.title.trim()
  if (!title) return { ok: false, error: 'Give the goal a name.' }
  if (title.length > MAX_VISION_TITLE) {
    return { ok: false, error: `Keep the name under ${MAX_VISION_TITLE} characters.` }
  }
  if ((draft.why ?? '').length > MAX_VISION_WHY) {
    return { ok: false, error: `Keep the reason under ${MAX_VISION_WHY} characters.` }
  }
  return { ok: true }
}

/**
 * The project a card is linked to, or null.
 *
 * Returns null for a project the user can no longer see as well as for no link
 * at all — the two are the same thing from the card's point of view, and it
 * means a stale id can never render as a broken badge. (The database sets the
 * link to null when a project is deleted; this covers the window before the
 * cache catches up.)
 */
export function linkedProject(card: VisionCard, projects: Project[]): Project | null {
  if (!card.project_id) return null
  return projects.find((p) => p.id === card.project_id) ?? null
}

/**
 * How a target date reads on the card. Never a warning, never a countdown in
 * red: a date on a goal is an intention, and one that has passed is information
 * rather than a failure.
 */
export type TargetTone = 'none' | 'ahead' | 'passed'

export function targetTone(card: VisionCard, today: string): TargetTone {
  if (!card.target_date) return 'none'
  return isBeforeDay(card.target_date, today) ? 'passed' : 'ahead'
}
