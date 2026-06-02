/**
 * Minimal class-name combiner (dependency-free).
 * Filters out falsy values and joins the rest with spaces.
 *
 * We intentionally avoid clsx/tailwind-merge to keep the dependency
 * surface aligned with the locked stack. Variant maps in our primitives
 * are designed not to produce conflicting Tailwind utilities.
 */
export type ClassValue = string | number | null | false | undefined

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ')
}
