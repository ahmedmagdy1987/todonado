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
/** Subscription tier gate (see supabase/migrations/20260706130000_billing.sql). */
export type BillingPlan = 'free' | 'pro'

/**
 * A user's Stripe subscription state. Written ONLY by the webhook (service-role);
 * the client can SELECT its own row but never write it (RLS SELECT-own only).
 */
export interface BillingRow {
  user_id: string
  plan: BillingPlan
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: string | null
  current_period_end: string | null
  updated_at: string
}

export interface Profile {
  id: string
  display_name: string | null
  /** The user's display name (collected at signup; editable in Settings). */
  full_name: string | null
  /** Unique (case-insensitive) display handle (shown as @username); not used for login — sign-in is email-only. Null until set. */
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
  /** Stable anchor date for monthly/yearly recurrence so the intended day-of-month
   *  is preserved across occurrences (month-end clamp is per-occurrence, not permanent). */
  recurrence_anchor: string | null
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
  recurrence_anchor?: string | null
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
    | 'recurrence_anchor'
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

// ---------------------------------------------------------------------------
//  Wellness tracking (personal supplement / vitamin / medication LOG — NOT
//  medical advice; dose/schedule are free text, never a drug/dosing engine)
// ---------------------------------------------------------------------------
export interface WellnessItem {
  id: string
  user_id: string
  name: string
  /** Free text, e.g. "500mg". */
  dose: string | null
  /** Free text, e.g. "daily" / "8am". Not a structured schedule. */
  schedule: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface NewWellnessItemInput {
  name: string
  dose?: string | null
  schedule?: string | null
  notes?: string | null
}

export type WellnessItemPatch = Partial<Pick<WellnessItem, 'name' | 'dose' | 'schedule' | 'notes'>>

/** Append-only "taken" event for an item. */
export interface WellnessLog {
  id: string
  user_id: string
  item_id: string
  taken_at: string
  created_at: string
}

export interface NewWellnessLogInput {
  item_id: string
}

// ---------------------------------------------------------------------------
//  Quit tracker (habits a user is BREAKING) — owner-only, user-scoped.
//  `quit_started_at` is day zero and the SOLE source of the clean streak: the
//  streak is derived from it, never stored. `longest_streak_days` is the only
//  denormalised value and only ever goes up. NOT medical software — `name`,
//  `replacement_action` and `notes` are free text the app never interprets.
//  See supabase/migrations/20260730120000_quit_habits.sql.
// ---------------------------------------------------------------------------
export interface QuitHabit {
  id: string
  user_id: string
  name: string
  /** One of the client's neutral preset keys (see quit/presets.ts), or 'custom'. */
  preset_key: string
  /** Day zero. Moving this forward IS the slip reset. */
  quit_started_at: string
  /** Best run ever completed, in whole local days. Monotonic. */
  longest_streak_days: number
  /** The "do this instead" action, free text. */
  replacement_action: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface NewQuitHabitInput {
  name: string
  preset_key?: string
  quit_started_at?: string
  replacement_action?: string | null
  notes?: string | null
}

export type QuitHabitPatch = Partial<
  Pick<
    QuitHabit,
    'name' | 'preset_key' | 'quit_started_at' | 'longest_streak_days' | 'replacement_action' | 'notes'
  >
>

/** An optional "still clean today" affirmation. Never gates the clean streak. */
export interface QuitCheckin {
  id: string
  user_id: string
  habit_id: string
  /** The LOCAL calendar day (yyyy-MM-dd) that was affirmed. */
  checked_on: string
  created_at: string
}

export interface NewQuitCheckinInput {
  habit_id: string
  checked_on: string
}

// ---------------------------------------------------------------------------
//  Calendar busy-import (ICS) — owner-only. A 'url' source stores the .ics URL
//  (fetched best-effort, often CORS-blocked); a 'file' source stores the raw
//  uploaded .ics text so today's busy minutes can be recomputed each day.
// ---------------------------------------------------------------------------
export type CalendarSourceKind = 'url' | 'file'

export interface CalendarSource {
  id: string
  user_id: string
  kind: CalendarSourceKind
  /** User-facing label (e.g. filename or "Work calendar"). */
  label: string
  /** The .ics URL for a 'url' source; null for a 'file' source. */
  url: string | null
  /** Raw .ics text for a 'file' source; null for a 'url' source. */
  ics_text: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
//  Personal templates (owner-only). `tasks` stores the SAME shape as the
//  built-in catalog, so one apply path serves both — see
//  supabase/migrations/20260728120000_user_templates.sql.
// ---------------------------------------------------------------------------
export interface UserTemplateTask {
  title: string
  effortMinutes: number
  section?: string
  note?: string
}

export interface UserTemplate {
  id: string
  user_id: string
  title: string
  description: string | null
  /** Optional lucide icon name, validated against the client allow-list. */
  icon: string | null
  color: string | null
  tasks: UserTemplateTask[]
  created_at: string
  updated_at: string
}

export interface NewUserTemplateInput {
  title: string
  description?: string | null
  icon?: string | null
  color?: string | null
  tasks: UserTemplateTask[]
}

export type UserTemplatePatch = Partial<
  Pick<UserTemplate, 'title' | 'description' | 'icon' | 'color' | 'tasks'>
>

export interface NewCalendarSourceInput {
  kind: CalendarSourceKind
  label: string
  url?: string | null
  ics_text?: string | null
}
