import { format, parseISO } from 'date-fns'

/** Format a minute count as "Xh Ym" (e.g. 90 -> "1h 30m", 45 -> "45m"). */
export function formatMinutes(total: number): string {
  if (total <= 0) return '0m'
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

/** Format an ISO date (`yyyy-MM-dd`) as a short label like "Jun 2". */
export function formatDateShort(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d')
  } catch {
    return iso
  }
}
