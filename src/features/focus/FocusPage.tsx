import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { FullScreenLoader } from '@/components/common/FullScreenLoader'
import { useFocusSessions } from './api/useFocusSessions'
import { activeSession } from './selectors'
import { SetupView } from './components/SetupView'
import { RunningView } from './components/RunningView'
import { SummaryView } from './components/SummaryView'

export function FocusPage() {
  const { workspaceId } = useWorkspace()
  const { data: sessions = [], isPending } = useFocusSessions(workspaceId)
  const [searchParams] = useSearchParams()
  const [endedId, setEndedId] = useState<string | null>(null)

  if (isPending) {
    return <FullScreenLoader label="Loading focus…" />
  }

  // A running session always wins — this is what re-enters focus after reload.
  const active = activeSession(sessions)
  if (active) {
    return <RunningView session={active} onEnded={setEndedId} />
  }

  // Just-ended session -> calm summary.
  if (endedId) {
    const ended = sessions.find((s) => s.id === endedId)
    if (ended) {
      return <SummaryView session={ended} onDone={() => setEndedId(null)} />
    }
  }

  return (
    <SetupView initialTaskId={searchParams.get('task')} onStarted={() => setEndedId(null)} />
  )
}
