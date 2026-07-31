import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
  'aria-label'?: string
}

/**
 * Round, brand-filled completion checkbox.
 *
 * The CIRCLE stays 20px; the TAP TARGET is 44px on touch, bought with negative
 * margin so nothing around it moves. This is the most-tapped control in the
 * product and it was a 20x20 hit area on a phone — the sweep found it on every
 * list surface.
 */
export function Checkbox({ checked, onChange, className, ...rest }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'tap-44 focus-ring flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
        checked
          ? 'border-transparent bg-brand-gradient text-white'
          : 'border-white/25 text-transparent hover:border-brand',
        className,
      )}
      {...rest}
    >
      <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
    </button>
  )
}
