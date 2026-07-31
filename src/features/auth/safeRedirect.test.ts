import { describe, expect, it } from 'vitest'
import { safeRedirectPath } from './safeRedirect'

describe('safeRedirectPath', () => {
  it('allows ordinary in-app paths', () => {
    expect(safeRedirectPath('/today')).toBe('/today')
    expect(safeRedirectPath('/projects/abc?tab=1#x')).toBe('/projects/abc?tab=1#x')
    expect(safeRedirectPath('/')).toBe('/')
  })

  it('refuses anything that would leave the origin', () => {
    for (const evil of [
      'https://evil.test',
      'http://evil.test',
      '//evil.test',
      // The CVE-2025-68470 bypass shape: browsers normalise `/\` to `//`.
      String.raw`/\evil.test`,
      String.raw`\\evil.test`,
      'javascript:alert(1)',
      'data:text/html,x',
      'evil.test',
      '',
    ]) {
      expect(safeRedirectPath(evil), evil).toBe('/')
    }
  })

  it('refuses control characters and non-strings', () => {
    expect(safeRedirectPath('/today\nSet-Cookie: x')).toBe('/')
    expect(safeRedirectPath(`/today${String.fromCharCode(0)}`)).toBe('/')
    expect(safeRedirectPath(null)).toBe('/')
    expect(safeRedirectPath(undefined)).toBe('/')
    expect(safeRedirectPath({ pathname: '/today' })).toBe('/')
  })

  it('honours a caller-supplied fallback', () => {
    expect(safeRedirectPath('//evil.test', '/hub')).toBe('/hub')
  })
})
