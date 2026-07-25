import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * TEMPORARY DIAGNOSTIC — removed in the follow-up commit.
 *
 * Reports (a) which invocation contract this project's Vercel runtime uses and
 * (b) whether the request body stream is still READABLE by the time the handler
 * runs. (b) is the security-critical one: Stripe's webhook signature is computed
 * over the exact bytes, so if the platform had already consumed and parsed the
 * body we could only re-serialise it, and verification would always fail.
 *
 * Exposes nothing sensitive — no env values, no secrets, no body contents.
 */
export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
): Promise<void> {
  const readableBefore = req.readable

  let bytesRead = 0
  if (req.method === 'POST') {
    try {
      for await (const chunk of req) bytesRead += (chunk as Buffer).length
    } catch {
      bytesRead = -1
    }
  }

  const contentLength = req.headers['content-length'] ?? null

  const info = {
    contract: 'node',
    nodeVersion: process.version,
    method: req.method,
    // Was the stream untouched when the handler was entered?
    streamReadableOnEntry: readableBefore,
    // Bytes we could read ourselves.
    rawBytesRead: bytesRead,
    // What the platform claims was sent.
    contentLength,
    // Did the platform pre-parse a body for us? (type only, never contents)
    platformParsedBodyType: req.body === undefined ? 'undefined' : typeof req.body,
    // The verdict that matters for Stripe signature verification:
    rawBodyIsByteExact:
      req.method !== 'POST' ? null : bytesRead > 0 && String(bytesRead) === String(contentLength),
  }

  res.statusCode = 200
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(info))
}
