import { describe, expect, it } from 'vitest'
import { isFoundingEmail, resolvePlan } from './plan'

describe('isFoundingEmail', () => {
  const list = ['founder@todonado.app']
  it('matches case-insensitively and ignores surrounding space', () => {
    expect(isFoundingEmail('  Founder@Todonado.App ', list)).toBe(true)
  })
  it('is false for non-founders and missing emails', () => {
    expect(isFoundingEmail('someone@else.com', list)).toBe(false)
    expect(isFoundingEmail(null, list)).toBe(false)
    expect(isFoundingEmail(undefined, list)).toBe(false)
  })
})

describe('resolvePlan', () => {
  const list = ['founder@todonado.app']
  it('grants Pro to founding emails, Free to everyone else', () => {
    expect(resolvePlan('founder@todonado.app', null, list)).toBe('pro')
    expect(resolvePlan('free.user@example.com', null, list)).toBe('free')
    expect(resolvePlan(null, null, list)).toBe('free')
  })
  it('lets an explicit override win in both directions', () => {
    expect(resolvePlan('free.user@example.com', 'pro', list)).toBe('pro')
    // a founder previewing the free experience
    expect(resolvePlan('founder@todonado.app', 'free', list)).toBe('free')
  })
})
