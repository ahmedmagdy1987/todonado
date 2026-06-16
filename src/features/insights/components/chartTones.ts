/** Shared chart color tones (kept out of the component file so it can be
 *  imported by both the chart and its legends without tripping fast-refresh). */
export type ChartTone = 'brand' | 'accent' | 'success' | 'warning' | 'danger'

export const TONE: Record<ChartTone, { track: string; fill: string }> = {
  brand: { track: 'bg-brand/25', fill: 'bg-brand' },
  accent: { track: 'bg-accent/25', fill: 'bg-accent' },
  success: { track: 'bg-success/25', fill: 'bg-success' },
  warning: { track: 'bg-warning/25', fill: 'bg-warning' },
  danger: { track: 'bg-danger/25', fill: 'bg-danger' },
}
