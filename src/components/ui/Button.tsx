import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const base =
  // `whitespace-nowrap`: an h-8/h-10 pill has no room for a second line, so a
  // two-word label used to break inside it — "Get to / work" and "Plan my / day"
  // sat clipped in their own buttons on Today at 390px. Buttons wrap the ROW,
  // never the label.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all focus-ring disabled:pointer-events-none disabled:opacity-50 select-none'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-gradient text-white shadow-brand-glow hover:brightness-110 active:brightness-95',
  secondary:
    'bg-surface-2 text-text-primary border border-white/5 hover:bg-surface-2/70',
  ghost: 'text-text-muted hover:bg-surface-2/60 hover:text-text-primary',
  outline: 'border border-white/10 text-text-primary hover:bg-surface-2/60',
  danger: 'bg-danger text-white hover:brightness-110 active:brightness-95',
}

/**
 * `sm` and `icon` are 44px on TOUCH and their designed size from `md` up.
 *
 * The 44px floor is the standard minimum tap target, and the small size is not a
 * decorative variant here — it carries "Get to work", "Plan my day", "Roll over
 * all", "Join", "Record", "Save as template". A sweep of every route at 390px
 * found fifteen such controls at 32px, which is a miss you feel rather than see.
 * Desktop density is untouched: the `md:` half restores the original height.
 */
const sizes: Record<ButtonSize, string> = {
  sm: 'h-11 px-3 text-sm md:h-8',
  md: 'h-11 px-4 text-sm md:h-10',
  lg: 'h-12 px-6 text-base',
  icon: 'h-11 w-11 md:h-10 md:w-10',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled ?? loading}
        aria-busy={loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'
