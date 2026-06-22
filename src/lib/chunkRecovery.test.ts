import { describe, it, expect } from 'vitest'
import { isChunkLoadError } from './chunkRecovery'

describe('isChunkLoadError', () => {
  it('detects the common chunk / dynamic-import / preload failure messages', () => {
    const positives = [
      'Failed to fetch dynamically imported module: https://app/assets/index-abc123.js',
      'error loading dynamically imported module',
      'Importing a module script failed.',
      'ChunkLoadError: Loading chunk 42 failed.',
      'Loading CSS chunk 3 failed',
      'Failed to load module script',
    ]
    for (const msg of positives) {
      expect(isChunkLoadError(msg)).toBe(true)
      expect(isChunkLoadError(new Error(msg))).toBe(true)
    }
  })

  it('ignores unrelated errors', () => {
    expect(isChunkLoadError('TypeError: cannot read properties of undefined')).toBe(false)
    expect(isChunkLoadError(new Error('rls denied'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError({})).toBe(false)
  })
})
