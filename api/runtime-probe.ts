/**
 * TEMPORARY DIAGNOSTIC — remove once the handler contract is settled.
 *
 * Answers correctly under BOTH invocation contracts and reports which one this
 * project's Vercel runtime actually uses:
 *   - "node" → invoked as (req: IncomingMessage, res: ServerResponse)
 *   - "web"  → invoked as (req: Request) and expected to RETURN a Response
 *
 * Exposes nothing sensitive: no env values, no secrets — just the contract, the
 * Node version, and the first argument's constructor name.
 */
interface NodeResLike {
  statusCode: number
  setHeader(name: string, value: string): void
  end(chunk: string): void
}

function isNodeRes(value: unknown): value is NodeResLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as NodeResLike).end === 'function' &&
    typeof (value as NodeResLike).setHeader === 'function'
  )
}

export default function handler(...args: unknown[]): Response | undefined {
  const [first, second] = args
  const contract = isNodeRes(second) ? 'node' : 'web'
  const info = {
    contract,
    argc: args.length,
    nodeVersion: process.version,
    firstArgCtor:
      typeof first === 'object' && first !== null ? first.constructor?.name ?? null : typeof first,
    hasRequestGlobal: typeof Request !== 'undefined',
    hasResponseGlobal: typeof Response !== 'undefined',
  }
  const payload = JSON.stringify(info)

  if (isNodeRes(second)) {
    second.statusCode = 200
    second.setHeader('content-type', 'application/json')
    second.end(payload)
    return undefined
  }

  return new Response(payload, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
