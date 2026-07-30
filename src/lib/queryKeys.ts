/**
 * Central TanStack Query key registry. Keep all keys here so invalidation
 * stays consistent across hooks.
 */
export const qk = {
  workspace: ['workspace'] as const,
  profile: ['profile'] as const,
  tasks: (workspaceId: string) => ['tasks', workspaceId] as const,
  projects: (workspaceId: string) => ['projects', workspaceId] as const,
  sections: (projectId: string) => ['sections', projectId] as const,
  subtasks: (taskId: string) => ['subtasks', taskId] as const,
  focus: (workspaceId: string) => ['focus', workspaceId] as const,
  // Wellness tracker — user-owned (keyed by user, not workspace).
  wellnessItems: (userId: string) => ['wellness-items', userId] as const,
  wellnessLogs: (userId: string) => ['wellness-logs', userId] as const,
  // Calendar busy-import — user-owned sources + derived today busy-minutes.
  calendarSources: (userId: string) => ['calendar-sources', userId] as const,
  calendarBusy: (userId: string, day: string) => ['calendar-busy', userId, day] as const,
  // Billing — the user's own subscription row (SELECT own).
  billing: (userId: string) => ['billing', userId] as const,
  // Personal templates — user-owned (keyed by user, not workspace).
  userTemplates: (userId: string) => ['user-templates', userId] as const,
  // Quit tracker — user-owned habits being broken + their optional check-ins.
  quitHabits: (userId: string) => ['quit-habits', userId] as const,
  quitCheckins: (userId: string) => ['quit-checkins', userId] as const,
  // Vision cards — user-owned goals (keyed by user, not workspace).
  visionCards: (userId: string) => ['vision-cards', userId] as const,
}
