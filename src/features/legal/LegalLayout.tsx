import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LEGAL_CONTACT } from '@/lib/config'
import { MarketingHeader } from '@/features/marketing/components/MarketingHeader'
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter'

/**
 * Shared scaffold for the static legal pages (Privacy, Terms). Keeps the public
 * chrome consistent and the prose readable.
 *
 * LEGAL_CONTACT lives in src/lib/config.ts (single source of truth) and is
 * re-exported here for the legal pages. LEGAL_LAST_UPDATED stays local: the
 * date shown at the top of each document.
 */
export const LEGAL_LAST_UPDATED = 'June 16, 2026'
export { LEGAL_CONTACT }

interface LegalLayoutProps {
  title: string
  lastUpdated?: string
  intro?: ReactNode
  children: ReactNode
}

export function LegalLayout({
  title,
  lastUpdated = LEGAL_LAST_UPDATED,
  intro,
  children,
}: LegalLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-text-primary">
      <MarketingHeader />
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-text-muted">Last updated: {lastUpdated}</p>
          {intro ? <div className="mt-6 space-y-3 text-text-muted">{intro}</div> : null}
          <div className="mt-10 space-y-10">{children}</div>
          <div className="mt-12 border-t border-white/5 pt-6 text-sm text-text-muted">
            Questions about this page? Reach us at{' '}
            <span className="text-text-primary">{LEGAL_CONTACT}</span>.{' '}
            <Link to="/welcome" className="focus-ring rounded text-brand hover:underline">
              Back to home
            </Link>
          </div>
        </article>
      </main>
      <MarketingFooter />
    </div>
  )
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold text-text-primary">{heading}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-text-muted">{children}</div>
    </section>
  )
}
