import { describe, it, expect } from 'vitest'
import { EFFORT_PRESETS, parseEffortInput, toggleEffortPreset } from './effort'

describe('toggleEffortPreset (chip -> effort_minutes)', () => {
  it('selects a preset when nothing or another preset is active', () => {
    expect(toggleEffortPreset(null, 30)).toBe(30)
    expect(toggleEffortPreset(60, 30)).toBe(30)
  })

  it('clears the estimate (null) when the active preset is tapped again', () => {
    expect(toggleEffortPreset(30, 30)).toBeNull()
  })

  it('maps every preset to a positive one-tap estimate', () => {
    for (const p of EFFORT_PRESETS) {
      expect(toggleEffortPreset(null, p)).toBe(p)
      expect(p).toBeGreaterThan(0)
    }
  })
})

describe('parseEffortInput (custom effort entry)', () => {
  it('returns null for blank or non-numeric input', () => {
    expect(parseEffortInput('')).toBeNull()
    expect(parseEffortInput('   ')).toBeNull()
    expect(parseEffortInput('abc')).toBeNull()
  })

  it('rounds to whole minutes and clamps negatives to 0', () => {
    expect(parseEffortInput('45')).toBe(45)
    expect(parseEffortInput('2.6')).toBe(3)
    expect(parseEffortInput('-5')).toBe(0)
  })
})
