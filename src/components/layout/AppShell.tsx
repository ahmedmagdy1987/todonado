import { Suspense, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useRealtimeSync } from '@/features/tasks/api/useRealtimeSync'
import { TaskDialog } from '@/features/tasks/components/TaskDialog'
import { OnboardingOverlay } from '@/features/onboarding/OnboardingOverlay'
import { shouldShowOnboarding } from '@/features/onboarding/gating'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { BottomNav } from './BottomNav'
import { AddTaskFab } from './AddTaskFab'

/**
 * Routes that are BOARDS rather than documents, and so get the full width.
 *
 * Deliberately a tiny, explicit list rather than a per-page prop: content width
 * is a property of the shell, and one place to look is worth more than the
 * flexibility. Adding a route here should require the same argument /week made —
 * that it lays out columns across the screen, not paragraphs down it.
 */
const WIDE_ROUTES = ['/week']

function isWideRoute(pathname: string): boolean {
  return WIDE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))
}

function ShellBody() {
  const { workspaceId, profile } = useWorkspace()
  useRealtimeSync(workspaceId)
  const [createOpen, setCreateOpen] = useState(false)
  const wide = isWideRoute(useLocation().pathname)

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onAddTask={() => setCreateOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          {/* THE shared page-content frame for every in-app page — one source of
              truth for content width. max-w-6xl (~1152px) gives a roomy, centered
              desktop column with balanced gutters next to the sidebar; tune here.
              It only binds on large screens (the column is narrower than this up
              to ~1024px viewport), so tablet/mobile are unchanged. Extra bottom
              padding on mobile clears the fixed bottom nav + home-indicator.

              ONE ROUTE OPTS OUT, and only because it is a different KIND of page:
              see WIDE_ROUTES. Reading widths are right for pages you read; a
              seven-column board is a page you scan, and capping it at 1152px left
              512px of empty gutter on a 1920 screen while the day columns were
              105px wide. */}
          <div
            className={cn(
              'mx-auto w-full px-6 pb-[calc(6rem_+_env(safe-area-inset-bottom))] pt-10 md:px-8 md:pb-16 md:pt-12',
              wide ? 'max-w-[1760px]' : 'max-w-6xl',
            )}
          >
            {/* Content-area Suspense so switching between lazy-loaded app pages
                keeps the shell (sidebar/topbar) instead of a full-screen loader. */}
            <Suspense
              fallback={
                <div className="flex justify-center py-24" role="status" aria-label="Loading">
                  <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <BottomNav />
      <AddTaskFab onClick={() => setCreateOpen(true)} />
      <TaskDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {shouldShowOnboarding(profile) && <OnboardingOverlay />}
    </div>
  )
}

export function AppShell() {
  return (
    <WorkspaceProvider>
      <ShellBody />
    </WorkspaceProvider>
  )
}
