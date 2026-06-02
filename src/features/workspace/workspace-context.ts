import { createContext, useContext } from 'react'
import type { Profile, Workspace } from '@/types/database'

export interface WorkspaceContextValue {
  workspaceId: string
  workspace: Workspace
  profile: Profile | null
  /** Effective daily capacity (minutes), profile value or default. */
  capacityMinutes: number
}

export const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined)

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) {
    throw new Error('useWorkspace must be used within a <WorkspaceProvider>')
  }
  return ctx
}
