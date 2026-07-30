import { describe, expect, it } from 'vitest'
import {
  firstNameOnly,
  shareCardCopy,
  shareCardFilename,
  shareCardMessage,
} from './shareCard'

/**
 * The card's whole risk is that it says too much. These tests pin what it CAN
 * contain — a number, a caption, a first name — and, more importantly, what it
 * can never contain.
 *
 * The canvas drawing itself is exercised end-to-end (e2e/share.spec.ts asserts a
 * real, non-blank PNG comes out of a real browser); there is no canvas in the
 * node test environment, so unit-testing it here would only test a fake.
 */

describe('firstNameOnly', () => {
  it('takes the first word and nothing else', () => {
    expect(firstNameOnly('Ada Lovelace')).toBe('Ada')
    expect(firstNameOnly('  Grace   Hopper  ')).toBe('Grace')
  })

  it('is empty for a missing name, so the line simply drops', () => {
    expect(firstNameOnly(null)).toBe('')
    expect(firstNameOnly(undefined)).toBe('')
    expect(firstNameOnly('')).toBe('')
    expect(firstNameOnly('   ')).toBe('')
  })

  it('NEVER lets an email through', () => {
    // Signup allows an email-shaped display name; putting one on a public image
    // would be a genuine leak, so it is dropped entirely rather than truncated.
    expect(firstNameOnly('ada@example.com')).toBe('')
    expect(firstNameOnly('ada@example.com Lovelace')).toBe('')
  })

  it('caps the length so a pasted essay cannot become the card', () => {
    expect(firstNameOnly('x'.repeat(500))).toHaveLength(20)
  })
})

describe('shareCardCopy', () => {
  it('says days clean for a quit card, and never what was quit', () => {
    const copy = shareCardCopy('quit', 10, 'Ada')
    expect(copy.value).toBe('10')
    expect(copy.caption).toBe('days clean')
    expect(copy.eyebrow).toBe('Ada on Todonado')
  })

  it('says days of showing up for a streak card', () => {
    expect(shareCardCopy('streak', 12).caption).toBe('days of showing up')
  })

  it('gets the singular right', () => {
    expect(shareCardCopy('quit', 1).caption).toBe('day clean')
    expect(shareCardCopy('streak', 1).caption).toBe('day of showing up')
  })

  it('falls back to a nameless eyebrow rather than an empty line', () => {
    expect(shareCardCopy('quit', 5).eyebrow).toBe('On Todonado')
    expect(shareCardCopy('quit', 5, '   ').eyebrow).toBe('On Todonado')
    expect(shareCardCopy('quit', 5, 'ada@example.com').eyebrow).toBe('On Todonado')
  })

  it('never renders a negative or fractional number', () => {
    expect(shareCardCopy('quit', -3).value).toBe('0')
    expect(shareCardCopy('quit', 7.9).value).toBe('7')
  })

  it('carries NOTHING but the number, the caption and a first name', () => {
    const copy = shareCardCopy('quit', 30, 'Ada Lovelace')
    const all = `${copy.value} ${copy.caption} ${copy.eyebrow}`
    // The habit's name is not even a parameter of this function — but assert the
    // shape anyway, so a future signature change trips here first.
    expect(all).not.toMatch(/smoking|alcohol|adult|eating|habit/i)
    expect(all).not.toMatch(/@/)
    expect(Object.keys(copy).sort()).toEqual(['caption', 'eyebrow', 'value'])
  })
})

describe('shareCardFilename', () => {
  it('is descriptive but anonymous', () => {
    expect(shareCardFilename('quit', 30)).toBe('todonado-clean-30-days.png')
    expect(shareCardFilename('streak', 7)).toBe('todonado-streak-7-days.png')
  })

  it('never contains a name', () => {
    expect(shareCardFilename('quit', 1)).not.toMatch(/[A-Z]/)
  })
})

describe('shareCardMessage', () => {
  it('is short, true, and carries the domain', () => {
    expect(shareCardMessage('quit', 10)).toBe('10 days clean. 🌪️ todonado.com')
    expect(shareCardMessage('streak', 1)).toBe('1 day of showing up. 🌪️ todonado.com')
  })

  it('makes no claim about the product', () => {
    for (const kind of ['quit', 'streak'] as const) {
      const msg = shareCardMessage(kind, 42)
      expect(msg).not.toMatch(/best|#1|replaces|better than|world/i)
    }
  })
})
