/**
 * Auto-effort estimation — suggest an `effort_minutes` value for a new/edited
 * task. Pure, deterministic, NO external AI/API. Two sources, in order:
 *
 *   1. HISTORY — the user's own completed tasks that look similar (shared title
 *      keywords and/or the same project). Each match contributes the time it
 *      ACTUALLY took (summed focus time) or, failing that, its recorded
 *      `effort_minutes`. We suggest the median of the closest matches (median is
 *      robust to the odd wildly-off task).
 *   2. HEURISTIC — when there isn't enough history, a transparent keyword/length
 *      table (tunable in ONE place: HEURISTIC_RULES + the length defaults).
 *
 * The result is ALWAYS a labelled suggestion (`basis`), never a silent set — the
 * UI shows it as a one-tap chip the user can accept, override, or ignore.
 */
import type { FocusSession, Task } from '@/types/database'
import { EFFORT_PRESETS } from './effort'

export interface EffortSuggestion {
  minutes: number
  /** Where the number came from, so the UI can label it honestly. */
  basis: 'history' | 'heuristic'
  /** How many similar past tasks fed the median (history basis only). */
  sampleCount?: number
}

/** Min similar past tasks before we trust history over the heuristic. */
export const AUTO_EFFORT_MIN_SAMPLES = 3
/** Cap the matches fed into the median (closest-first). */
const MAX_MATCHES = 7

const STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'for', 'and', 'or', 'of', 'with', 'my', 'in', 'on', 'at', 'is',
  'it', 'this', 'that', 'some', 'from', 'by', 'as', 'be', 'do', 'we', 'you', 'our', 'your',
])

/** Lowercased, de-duplicated, meaningful word tokens from a title. Pure. */
export function tokenize(title: string): string[] {
  return Array.from(
    new Set(
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
    ),
  )
}

interface HeuristicRule {
  test: RegExp
  minutes: number
}

/** The keyword→minutes table. Tunable in ONE place; first match wins, top-down. */
export const HEURISTIC_RULES: HeuristicRule[] = [
  { test: /\b(meet|meeting|call|sync|standup|stand-up|interview|1:1|one on one)\b/, minutes: 30 },
  { test: /\b(email|reply|respond|message|dm|ping|slack)\b/, minutes: 15 },
  { test: /\b(write|writing|draft|blog|post|essay|article|report|proposal|document)\b/, minutes: 45 },
  { test: /\b(review|read|reading|proofread|feedback)\b/, minutes: 30 },
  { test: /\b(errand|errands|buy|shop|shopping|grocery|groceries|pickup|return|drop off)\b/, minutes: 20 },
  { test: /\b(plan|planning|outline|brainstorm|research|prep|prepare)\b/, minutes: 30 },
  { test: /\b(fix|bug|debug|patch|hotfix|issue)\b/, minutes: 45 },
  { test: /\b(build|implement|develop|code|coding|design|feature)\b/, minutes: 60 },
  { test: /\b(workout|exercise|gym|run|walk|stretch|meditate|meditation)\b/, minutes: 30 },
  { test: /\b(clean|tidy|organize|laundry|dishes|chore|chores)\b/, minutes: 20 },
]

const DEFAULT_SHORT = 15
const DEFAULT_MEDIUM = 30
const DEFAULT_LONG = 45

/** Transparent fallback estimate from keywords, then title length. Pure. */
export function heuristicEffort(title: string): number {
  const lower = title.toLowerCase()
  for (const rule of HEURISTIC_RULES) {
    if (rule.test.test(lower)) return rule.minutes
  }
  const words = tokenize(title).length
  const len = title.trim().length
  if (words <= 1 || len <= 12) return DEFAULT_SHORT
  if (words >= 6 || len >= 45) return DEFAULT_LONG
  return DEFAULT_MEDIUM
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Snap a raw minute value to the nearest 5 (never below 5) — keeps all the
 *  common effort values (15/30/45/60/90/120) intact and stays predictable. */
export function snapMinutes(min: number): number {
  return Math.max(5, Math.round(min / 5) * 5)
}

/** True when a value already lands on one of the one-tap effort presets. */
export function isEffortPreset(minutes: number): boolean {
  return (EFFORT_PRESETS as readonly number[]).includes(minutes)
}

/**
 * Suggest an effort estimate for `candidate` from the user's tasks/sessions.
 * Returns null only for an empty/too-short title; otherwise always a suggestion
 * (history when there are enough similar completed tasks, else the heuristic).
 */
export function suggestEffort(
  candidate: { title: string; projectId?: string | null },
  tasks: Task[],
  sessions: FocusSession[],
  opts: { minSamples?: number } = {},
): EffortSuggestion | null {
  const title = candidate.title.trim()
  if (title.length < 2) return null
  const minSamples = opts.minSamples ?? AUTO_EFFORT_MIN_SAMPLES

  // Actual focused minutes per task (finished sessions only).
  const actualByTask = new Map<string, number>()
  for (const s of sessions) {
    if (!s.task_id || s.status === 'running') continue
    actualByTask.set(s.task_id, (actualByTask.get(s.task_id) ?? 0) + s.actual_seconds)
  }

  const keywords = new Set(tokenize(title))
  const matches: { value: number; score: number; createdAt: string }[] = []
  for (const t of tasks) {
    if (t.status !== 'done') continue
    const actualSec = actualByTask.get(t.id) ?? 0
    // What it actually took: prefer real focus time, else the recorded estimate.
    const value = actualSec > 0 ? actualSec / 60 : (t.effort_minutes ?? 0)
    if (value <= 0) continue
    let shared = 0
    for (const w of tokenize(t.title)) if (keywords.has(w)) shared += 1
    const sameProject = candidate.projectId != null && t.project_id === candidate.projectId
    const score = shared + (sameProject ? 1 : 0)
    if (score <= 0) continue
    matches.push({ value, score, createdAt: t.created_at })
  }

  if (matches.length >= minSamples) {
    // Closest first (most shared keywords / same project), then most recent.
    matches.sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt))
    const top = matches.slice(0, MAX_MATCHES)
    return {
      minutes: snapMinutes(median(top.map((m) => m.value))),
      basis: 'history',
      sampleCount: top.length,
    }
  }

  return { minutes: heuristicEffort(title), basis: 'heuristic' }
}
