import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import { DEFAULT_DAILY_CAPACITY_MINUTES } from '@/lib/config'
import type { Profile, Workspace } from '@/types/database'
import { useAuth } from '@/features/auth/auth-context'
import { FullScreenLoader } from '@/components/common/FullScreenLoader'
import { Button } from '@/components/ui'
import { WorkspaceContext } from './workspace-context'
import { assertRealIds } from '@/lib/optimistic'

/** Find the user's workspace, creating a default one if none exists (resilience). */
async function ensureWorkspace(userId: string): Promise<Workspace> {
  assertRealIds({ owner_id: userId })
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  if (data && data.length > 0) return data[0] as Workspace

  const { data: created, error: createError } = await supabase
    .from('workspaces')
    .insert({ owner_id: userId, name: 'My Workspace' })
    .select('*')
    .single()
  if (createError) throw createError

  // Best-effort owner membership; owner_id already grants access via RLS.
  await supabase
    .from('workspace_members')
    .insert({ workspace_id: created.id, user_id: userId, role: 'owner' })
  return created as Workspace
}

/** Load the user's profile, creating it if the auth bootstrap hasn't run. */
async function ensureProfile(user: User): Promise<Profile> {
  assertRealIds({ id: user.id })
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).limit(1)
  if (error) throw error
  if (data && data.length > 0) return data[0] as Profile

  const { data: created, error: createError } = await supabase
    .from('profiles')
    .insert({ id: user.id, display_name: user.email?.split('@')[0] ?? null })
    .select('*')
    .single()
  if (createError) throw createError
  return created as Profile
}

function WorkspaceError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/15 text-danger">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </span>
      <div>
        <h2 className="font-display text-xl font-semibold">Couldn&rsquo;t load your workspace</h2>
        <p className="mt-1 max-w-md text-sm text-text-muted">{message}</p>
        <p className="mt-2 max-w-md text-xs text-text-muted/80">
          If this is a fresh project, make sure the database migrations in{' '}
          <code className="font-mono">supabase/migrations</code> have been applied.
        </p>
      </div>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  const workspaceQuery = useQuery({
    queryKey: qk.workspace,
    queryFn: () => ensureWorkspace(user!.id),
    enabled: !!user,
    staleTime: 5 * 60_000,
  })

  const profileQuery = useQuery({
    queryKey: qk.profile,
    queryFn: () => ensureProfile(user!),
    enabled: !!user,
    staleTime: 5 * 60_000,
  })

  if (!user) return null

  if (workspaceQuery.isPending || profileQuery.isPending) {
    return <FullScreenLoader label="Loading your workspace…" />
  }

  if (workspaceQuery.isError || !workspaceQuery.data) {
    const message =
      workspaceQuery.error instanceof Error
        ? workspaceQuery.error.message
        : 'Unknown error reaching Supabase.'
    return (
      <WorkspaceError
        message={message}
        onRetry={() => {
          void workspaceQuery.refetch()
          void profileQuery.refetch()
        }}
      />
    )
  }

  const profile = profileQuery.data ?? null

  return (
    <WorkspaceContext.Provider
      value={{
        workspaceId: workspaceQuery.data.id,
        workspace: workspaceQuery.data,
        profile,
        capacityMinutes: profile?.daily_capacity_minutes ?? DEFAULT_DAILY_CAPACITY_MINUTES,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}
