import { supabase } from '@/lib/supabase'

/** Gather everything the signed-in user owns in this workspace into one object. */
export async function gatherExport(workspaceId: string): Promise<Record<string, unknown>> {
  const [profileRes, workspaceRes, projectsRes, tasksRes, focusRes] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('workspaces').select('*').eq('id', workspaceId),
    supabase.from('projects').select('*').eq('workspace_id', workspaceId),
    supabase.from('tasks').select('*').eq('workspace_id', workspaceId),
    supabase.from('focus_sessions').select('*').eq('workspace_id', workspaceId),
  ])

  const projects = projectsRes.data ?? []
  const projectIds = projects.map((p) => p.id as string)
  const sectionsRes = projectIds.length
    ? await supabase.from('sections').select('*').in('project_id', projectIds)
    : { data: [] as unknown[] }

  return {
    app: 'todonado',
    exported_at: new Date().toISOString(),
    profile: (profileRes.data ?? [])[0] ?? null,
    workspace: (workspaceRes.data ?? [])[0] ?? null,
    projects,
    sections: sectionsRes.data ?? [],
    tasks: tasksRes.data ?? [],
    focus_sessions: focusRes.data ?? [],
  }
}

/** Trigger a browser download of `data` as pretty-printed JSON. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
