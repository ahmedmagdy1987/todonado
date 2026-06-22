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
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly'
/** Fake-door demand-capture keys for unbuilt "Focus & Calm" wellness concepts. */
export type FeatureKey = 'meditation' | 'sleep_sounds' | 'supplement_tracker'

export interface Profile {
  id: string
  display_name: string | null
  /** The user's display name (collected at signup; editable in Settings). */
  full_name: string | null
  /** Unique (case-insensitive) handle for username login; null until set. */
  username: string | null
  avatar_url: string | null
  /** Planning capacity per day, in minutes (default 360 = 6h). */
  daily_capacity_minutes: number
  /** First-run onboarding finished (or skipped); never re-shown once true. */
  onboarding_completed: boolean
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
  // Recurrence — recurrence_freq null means a normal one-off task.
  recurrence_freq: RecurrenceFreq | null
  recurrence_interval: number
  recurrence_weekdays: number[] | null
  recurrence_until: string | null
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

// ---------------------------------------------------------------------------
//  Insert / update input shapes (what the client sends; DB fills the rest)
// ---------------------------------------------------------------------------
export interface NewTaskInput {
  workspace_id: string
  title: string
  project_id?: string | null
  section_id?: string | null
  notes?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  due_date?: string | null
  effort_minutes?: number | null
  scheduled_for?: string | null
  position?: number
  recurrence_freq?: RecurrenceFreq | null
  recurrence_interval?: number
  recurrence_weekdays?: number[] | null
  recurrence_until?: string | null
}

export type TaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'notes'
    | 'status'
    | 'priority'
    | 'due_date'
    | 'effort_minutes'
    | 'scheduled_for'
    | 'position'
    | 'project_id'
    | 'section_id'
    | 'completed_at'
    | 'recurrence_freq'
    | 'recurrence_interval'
    | 'recurrence_weekdays'
    | 'recurrence_until'
  >
>

export interface NewProjectInput {
  workspace_id: string
  name: string
  color?: string
}

export interface NewSectionInput {
  project_id: string
  name: string
  position?: number
}

export interface NewSubtaskInput {
  task_id: string
  title: string
  position?: number
}

// ---------------------------------------------------------------------------
//  Focus sessions (task-bound focus mode)
// ---------------------------------------------------------------------------
export type FocusStatus = 'running' | 'completed' | 'abandoned'

export interface FocusSession {
  id: string
  workspace_id: string
  /** null = general (non-task) focus. */
  task_id: string | null
  planned_minutes: number
  started_at: string
  ended_at: string | null
  actual_seconds: number
  interruptions: number
  status: FocusStatus
  /** When currently paused, the instant it was paused (null = running). */
  paused_at: string | null
  /** Total paused seconds accumulated before the current pause. */
  accumulated_paused_seconds: number
  created_at: string
  updated_at: string
}

export interface NewFocusSessionInput {
  workspace_id: string
  task_id?: string | null
  planned_minutes: number
}

export type FocusSessionPatch = Partial<
  Pick<
    FocusSession,
    | 'status'
    | 'ended_at'
    | 'actual_seconds'
    | 'interruptions'
    | 'paused_at'
    | 'accumulated_paused_seconds'
  >
>

// ---------------------------------------------------------------------------
//  Feature intents (fake-door demand capture — insert-only, no read-back)
// ---------------------------------------------------------------------------
export interface FeatureIntent {
  id: string
  /** null for a logged-out landing visitor; else the signed-in user. */
  user_id: string | null
  feature_key: FeatureKey
  /** Where the click came from, e.g. 'wellness' or 'landing'. */
  source: string | null
  created_at: string
}

/** Insert-only client shape (DB fills id + created_at; no update/patch type — write-only). */
export interface NewFeatureIntentInput {
  feature_key: FeatureKey
  user_id?: string | null
  source?: string | null
}
