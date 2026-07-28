import { Suspense, type ComponentType, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useInView, usePrefersReducedMotion } from './useReveal'

type RevealDirection = 'up' | 'left' | 'right' | 'scale'

const HIDDEN: Record<RevealDirection, string> = {
  up: 'translate-y-6 opacity-0',
  left: '-translate-x-6 opacity-0',
  right: 'translate-x-6 opacity-0',
  scale: 'scale-[0.97] opacity-0',
}

interface RevealProps {
  children: ReactNode
  className?: string
  direction?: RevealDirection
  /** Stagger, in ms. Ignored under reduced motion. */
  delay?: number
}

/**
 * Scroll-reveal wrapper: transform + opacity only (no layout properties), so it
 * composites on the GPU and never thrashes layout. Under reduced motion the
 * content renders immediately with no transition at all.
 */
export function Reveal({ children, className, direction = 'up', delay = 0 }: RevealProps) {
  const reduced = usePrefersReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>()
  const shown = reduced || inView

  return (
    <div
      ref={ref}
      className={cn(
        !reduced && 'transition-[transform,opacity] duration-700 ease-out',
        shown ? 'translate-x-0 translate-y-0 scale-100 opacity-100' : HIDDEN[direction],
        className,
      )}
      style={!reduced && delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

/**
 * Mounts a lazily-imported widget only once it approaches the viewport, so the
 * below-the-fold demo code never competes with the hero for bandwidth. A
 * fixed-height skeleton reserves the space up front, so arrival causes no
 * layout shift.
 *
 * `component` must be a module-scope `React.lazy(...)` value (created once,
 * never per render) — the same pattern AppRoutes uses for route chunks.
 */
export function LazyWidget({
  component: Widget,
  minHeight,
  label,
}: {
  component: ComponentType
  minHeight: number
  label: string
}) {
  const [ref, near] = useInView<HTMLDivElement>({ rootMargin: '300px 0px', threshold: 0 })

  return (
    // The reservation is RELEASED once mounted. Keeping it would leave dead
    // space forever wherever a widget renders shorter than its placeholder
    // (the empty capacity demo was 130px shorter at desktop widths).
    <div ref={ref} style={near ? undefined : { minHeight }}>
      {near ? (
        <Suspense fallback={<WidgetSkeleton minHeight={minHeight} label={label} />}>
          <Widget />
        </Suspense>
      ) : (
        <WidgetSkeleton minHeight={minHeight} label={label} />
      )}
    </div>
  )
}

/**
 * Defers a whole below-the-fold section until it nears the viewport. Children
 * are only *rendered* once `near` flips, so a `React.lazy` element inside is
 * never imported on first paint (creating the element does not trigger the
 * import — rendering it does). Props pass through normally, unlike
 * `LazyWidget`.
 *
 * `minHeight` reserves the scroll space beforehand so the page height — and
 * therefore the scrollbar — doesn't jump as sections arrive.
 */
export function LazySection({ minHeight, children }: { minHeight: number; children: ReactNode }) {
  const [ref, near] = useInView<HTMLDivElement>({ rootMargin: '400px 0px', threshold: 0 })
  return (
    <div ref={ref} style={near ? undefined : { minHeight }}>
      {near ? children : null}
    </div>
  )
}

function WidgetSkeleton({ minHeight, label }: { minHeight: number; label: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-3xl border border-white/5 bg-surface/40"
      style={{ minHeight }}
      role="status"
      aria-label={`Loading ${label}`}
    >
      <span className="h-2 w-24 animate-pulse rounded-full bg-surface-2" aria-hidden />
    </div>
  )
}
