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
}
