import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { useTasks } from '@/features/tasks/api/useTasks'
import { FullScreenLoader } from '@/components/common/FullScreenLoader'
import { FEATURES } from '@/lib/config'
import type { FocusSession } from '@/types/database'
import { useFocusMutations, useFocusSessions } from './api/useFocusSessions'
import { activeSession } from './selectors'
import {
  POMODORO,
  beginNextWorkInterval,
  completeWorkInterval,
  cyclePosition,
  startChain,
  type PomodoroChain,
} from './pomodoro'
import { readChain, writeChain } from './pomodoroStore'
import { SetupView } from './components/SetupView'
import { RunningView, type EndReason } from './components/RunningView'
import { BreakView } from './components/BreakView'
import { SummaryView } from './components/SummaryView'

/**
 * Focus, plus the pomodoro chain that strings sessions together.
 *
 * The chain lives HERE, in the one component that already owns the view switch,
 * for the same reason the running session does: this is the only place that can
 * see a session end and decide what comes next. Every transition goes through a
 * pure reducer from `pomodoro.ts` and is mirrored to localStorage in the same
 * call, so a reload mid-break resumes with the right time left.
 */
export function FocusPage() {
  const { workspaceId } = useWorkspace()
  const { data: sessions = [], isPending } = useFocusSessions(workspaceId)
  const { data: tasks = [] } = useTasks(workspaceId)
  const { startSession } = useFocusMutations(workspaceId)
  const [searchParams] = useSearchParams()
  const [endedId, setEndedId] = useState<string | null>(null)

  // Read once on mount so a reload lands back in the chain it left.
  const [chain, setChain] = useState<PomodoroChain | null>(() =>
    FEATURES.pomodoro ? readChain() : null,
  )

  const putChain = useCallback((next: PomodoroChain | null) => {
    setChain(next)
    writeChain(next)
  }, [])

  const handleStarted = useCallback(
    (session: FocusSession, pomodoro: boolean) => {
      setEndedId(null)
      putChain(pomodoro ? startChain(session.id, session.task_id) : null)
    },
    [putChain],
  )

  /**
   * A session ended. Only a run that reached zero on its own counts as a
   * pomodoro — `endStatusFor` records anything over a minute as 'completed' even
   * when the user stopped early, so the status alone would over-count.
   */
  const handleEnded = useCallback(
    (id: string, reason: EndReason) => {
      setEndedId(id)
      if (!chain) return
      if (chain.sessionId !== id) {
        // Not the interval this chain is running. If a break is already open,
        // leave it alone: `patchSession` is optimistic, so a write that failed
        // and a reload can re-fire the end for an interval already banked, and
        // dropping the chain there would throw away the user's break. Otherwise
        // the chain is stale and goes.
        if (!chain.break) putChain(null)
        return
      }
      putChain(reason === 'finished' ? completeWorkInterval(chain, Date.now()) : null)
    },
    [chain, putChain],
  )

  const startNextInterval = useCallback(() => {
    if (!chain) return
    startSession.mutate(
      {
        workspace_id: workspaceId,
        task_id: chain.taskId,
        planned_minutes: POMODORO.workMinutes,
      },
      {
        onSuccess: (session) => {
          setEndedId(null)
          putChain(beginNextWorkInterval(chain, session.id))
        },
      },
    )
  }, [chain, putChain, startSession, workspaceId])

  if (isPending) {
    return <FullScreenLoader label="Loading focus…" />
  }

  // A running session always wins — this is what re-enters focus after reload.
  const active = activeSession(sessions)
  if (active) {
    return (
      <RunningView
        session={active}
        onEnded={handleEnded}
        pomodoro={
          chain && chain.sessionId === active.id
            ? { position: cyclePosition(chain.completed), completed: chain.completed }
            : null
        }
      />
    )
  }

  // Mid-chain: the break comes before the summary, because the chain is not over.
  if (FEATURES.pomodoro && chain?.break) {
    const task = chain.taskId ? (tasks.find((t) => t.id === chain.taskId) ?? null) : null
    return (
      <BreakView
        brk={chain.break}
        completed={chain.completed}
        taskTitle={task?.title ?? null}
        onStartNext={startNextInterval}
        onEndChain={() => putChain(null)}
      />
    )
  }

  // Just-ended session -> calm summary.
  if (endedId) {
    const ended = sessions.find((s) => s.id === endedId)
    if (ended) {
      return <SummaryView session={ended} onDone={() => setEndedId(null)} />
    }
  }

  return (
    <SetupView
      initialTaskId={searchParams.get('task')}
      initialPomodoro={searchParams.get('pomodoro') === '1'}
      onStarted={handleStarted}
    />
  )
}
