import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchIcs, ICS_FETCH_TIMEOUT_MS, MAX_URL_ICS_BYTES } from './useCalendarBusy'

/**
 * Hardening tests for the untrusted URL-subscribe fetch: it must bound the body
 * size (Content-Length AND streamed bytes) and time out a stalled host, always
 * throwing (never hanging / OOM-ing) so the caller just marks the source hadError.
 */

const enc = new TextEncoder()

/** A Response-like object streaming `chunks`, with optional headers. */
function streamResponse(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  let i = 0
  const body = {
    getReader() {
      return {
        read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }),
        cancel: async () => {},
      }
    },
  }
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    body,
    text: async () => chunks.map((c) => new TextDecoder().decode(c)).join(''),
  }
}

afterEach(() => vi.restoreAllMocks())

describe('fetchIcs hardening', () => {
  it('assembles a small streamed body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([enc.encode('BEGIN:VEVENT\r\nEND:VEVENT')])))
    await expect(fetchIcs('https://cal.example/feed.ics')).resolves.toContain('BEGIN:VEVENT')
  })

  it('rejects a body that declares an oversized Content-Length', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamResponse([enc.encode('x')], { 'content-length': String(MAX_URL_ICS_BYTES + 1) })),
    )
    await expect(fetchIcs('https://cal.example/huge.ics')).rejects.toThrow(/too large/i)
  })

  it('aborts a stream that exceeds the byte cap even with no Content-Length (chunked)', async () => {
    // A 1 MB chunk repeated past the cap — simulates an unbounded chunked body.
    const oneMb = new Uint8Array(1_000_000)
    const chunks = Array.from({ length: Math.ceil(MAX_URL_ICS_BYTES / 1_000_000) + 2 }, () => oneMb)
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(chunks)))
    await expect(fetchIcs('https://cal.example/tarpit.ics')).rejects.toThrow(/too large/i)
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, headers: { get: () => null } })))
    await expect(fetchIcs('https://cal.example/500.ics')).rejects.toThrow(/HTTP 500/)
  })

  it('honors an already-aborted outer signal', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      return streamResponse([enc.encode('BEGIN:VEVENT')])
    })
    vi.stubGlobal('fetch', fetchMock)
    const ac = new AbortController()
    ac.abort()
    await expect(fetchIcs('https://cal.example/feed.ics', ac.signal)).rejects.toThrow()
  })

  it('exposes sane bounds', () => {
    expect(MAX_URL_ICS_BYTES).toBeGreaterThan(1_000_000) // larger than the 1MB upload cap
    expect(ICS_FETCH_TIMEOUT_MS).toBeGreaterThan(0)
  })
})
