import { cn } from '@/lib/utils'

interface LogoProps {
  className?: string
  iconClassName?: string
  showWordmark?: boolean
}

/**
 * Todonado brandmark: the tornado-with-checkmark icon + wordmark.
 * The icon asset lives in /public/icons (generated from the source logo).
 */
export function Logo({ className, iconClassName, showWordmark = true }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <img
        src="/icons/icon-192.png"
        alt="Todonado logo"
        width={32}
        height={32}
        className={cn('h-8 w-8 rounded-lg', iconClassName)}
      />
      {showWordmark && (
        <span className="font-display text-lg font-bold tracking-tight text-text-primary">
          Todo<span className="text-gradient-brand">nado</span>
        </span>
      )}
    </span>
  )
}
