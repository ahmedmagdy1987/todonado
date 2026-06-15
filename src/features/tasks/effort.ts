/**
 * Pure effort-capture helpers shared by the quick-add effort chips. No React,
 * no I/O — unit-tested. `effort_minutes` is the field the capacity meter sums,
 * so making it one tap to set is what keeps the whole "realistic day" wedge alive.
 */

/** One-tap effort presets (minutes), offered as chips wherever a task is created. */
export const EFFORT_PRESETS = [15, 30, 60, 90, 120] as const

/**
 * Toggle a preset chip: tapping the already-selected preset clears the estimate
 * (returns null); tapping any other preset selects it.
 */
export function toggleEffortPreset(current: number | null, preset: number): number | null {
  return current === preset ? null : preset
}

/**
 * Parse a custom effort entry into a sane minutes value: blank or non-numeric
 * input yields null (unestimated); otherwise a non-negative whole minute count.
 */
export function parseEffortInput(raw: string): number | null {
  const n = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(n)) return null
  return Math.max(0, Math.round(n))
}
