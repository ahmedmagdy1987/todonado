import { describe, it, expect } from 'vitest'
import { shouldShowOnboarding } from './gating'
import type { Profile } from '@/types/database'

function profile(onboarding_completed: boolean): Profile {
  return {
    id: 'u1',
    display_name: null,
    avatar_url: null,
    daily_capacity_minutes: 360,
    onboarding_completed,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

describe('shouldShowOnboarding', () => {
  it('shows for a new user (onboarding_completed = false)', () => {
    expect(shouldShowOnboarding(profile(false))).toBe(true)
  })

  it('is hidden once completed (= true) — never re-shows', () => {
    expect(shouldShowOnboarding(profile(true))).toBe(false)
  })

  it('does not show while the profile is still loading', () => {
    expect(shouldShowOnboarding(null)).toBe(false)
    expect(shouldShowOnboarding(undefined)).toBe(false)
  })
})
