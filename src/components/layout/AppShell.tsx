import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useRealtimeSync } from '@/features/tasks/api/useRealtimeSync'
import { TaskDialog } from '@/features/tasks/components/TaskDialog'
import { OnboardingOverlay } from '@/features/onboarding/OnboardingOverlay'
import { shouldShowOnboarding } from '@/features/onboarding/gating'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

function ShellBody() {
  const { workspaceId, profile } = useWorkspace()
  useRealtimeSync(workspaceId)
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onAddTask={() => setCreateOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-6 pb-16 pt-10 md:px-8 md:pt-12">
            <Outlet />
          </div>
        </main>
      </div>
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
