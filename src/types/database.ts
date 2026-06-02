/**
 * Hand-written database row types mirroring supabase/migrations.
 *
 * When the schema stabilizes, regenerate from the source of truth with:
 *   supabase gen types typescript --linked > src/types/database.generated.ts
 * and re-export from here. Until then these keep the app strongly typed.
 */

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'
export type ProjectStatus = 'active' | 'archived'
export type MemberRole = 'owner' | 'admin' | 'member'
/** 0 = none, 1 = low, 2 = medium, 3 = high */
export type TaskPriority = 0 | 1 | 2 | 3

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Workspace {
  id: string
  owner_id: string
  name: string
  created_at: string
  updated_at: string
}

export interface WorkspaceMember {
  workspace_id: string
  user_id: string
  role: MemberRole
  created_at: string
}

export interface Project {
  id: string
  workspace_id: string
  name: string
  color: string
  status: ProjectStatus
  created_at: string
  updated_at: string
}

export interface Section {
  id: string
  project_id: string
  name: string
  position: number
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  workspace_id: string
  project_id: string | null
  section_id: string | null
  title: string
  notes: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  /** Estimated effort in minutes — powers the Today capacity meter. */
  effort_minutes: number | null
  /** The day this task is planned for (effort-aware day planning). */
  scheduled_for: string | null
  position: number
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface Subtask {
  id: string
  task_id: string
  title: string
  done: boolean
  position: number
  created_at: string
  updated_at: string
}
