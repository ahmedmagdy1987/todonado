/**
 * A recording stand-in for Web Audio, for the unit suite ONLY.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * The countdown tick was silent in production for two releases while every test
 * passed, because the tests only ever checked CONSTANTS. `TICK_PEAK` was correct
 * the whole time; the graph built from it scheduled its envelope into the past
 * and rendered nothing. No assertion about a number could have caught that.
 *
 * So this records what was actually built and when it was scheduled, which is
 * the part that was wrong. The suite runs in `node` with no Web Audio at all, so
 * there is nothing to spy on otherwise.
 *
 * It is NOT a claim that a speaker made a sound — nothing headless can prove
 * that (the E2E browser runs `--mute-audio`). It proves the graph is connected
 * to the destination and every event is scheduled in the context's FUTURE, which
 * is exactly the property whose absence caused the silence.
 */

export interface ScheduledEvent {
  param: string
  method: 'setValueAtTime' | 'exponentialRampToValueAtTime' | 'linearRampToValueAtTime'
  value: number
  time: number
}

export interface NodeRecord {
  kind: 'oscillator' | 'gain' | 'bufferSource' | 'biquad'
  connectedTo: string[]
  startedAt: number | null
  stoppedAt: number | null
  frequency: number | null
}

export class MockAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended'
  currentTime = 12.5
  sampleRate = 48000
  destination = { id: 'destination' }
  resumeCalls = 0
  nodes: NodeRecord[] = []
  events: ScheduledEvent[] = []
  /** Every instance ever constructed, so a test can assert reuse. */
  static instances: MockAudioContext[] = []

  constructor() {
    MockAudioContext.instances.push(this)
  }

  /**
   * ASYNCHRONOUS ON PURPOSE, exactly like the real thing. A context unlocked
   * from a genuine user gesture still reports `suspended` for the rest of that
   * synchronous turn, and code that treats the immediate state as the verdict
   * concludes the browser refused when it did not.
   */
  resume(): Promise<void> {
    this.resumeCalls += 1
    return Promise.resolve().then(() => {
      this.state = 'running'
    })
  }

  private record(kind: NodeRecord['kind']): NodeRecord {
    const node: NodeRecord = {
      kind,
      connectedTo: [],
      startedAt: null,
      stoppedAt: null,
      frequency: null,
    }
    this.nodes.push(node)
    return node
  }

  private audioParam(node: NodeRecord, param: string) {
    const push = (method: ScheduledEvent['method']) => (value: number, time: number) => {
      this.events.push({ param, method, value, time })
      return this.audioParam(node, param)
    }
    return {
      value: 0,
      setValueAtTime: push('setValueAtTime'),
      exponentialRampToValueAtTime: push('exponentialRampToValueAtTime'),
      linearRampToValueAtTime: push('linearRampToValueAtTime'),
    }
  }

  private connectable(node: NodeRecord) {
    return {
      connect: (target: { id?: string } | { __node?: NodeRecord }) => {
        const id = (target as { id?: string }).id
        node.connectedTo.push(id ?? 'node')
      },
      __node: node,
    }
  }

  createOscillator() {
    const node = this.record('oscillator')
    return {
      ...this.connectable(node),
      type: 'sine' as OscillatorType,
      frequency: {
        get value() {
          return node.frequency ?? 0
        },
        set value(v: number) {
          node.frequency = v
        },
      },
      start: (t: number) => void (node.startedAt = t),
      stop: (t: number) => void (node.stoppedAt = t),
    }
  }

  createGain() {
    const node = this.record('gain')
    return { ...this.connectable(node), gain: this.audioParam(node, 'gain') }
  }

  createBufferSource() {
    const node = this.record('bufferSource')
    return {
      ...this.connectable(node),
      buffer: null as unknown,
      start: (t: number) => void (node.startedAt = t),
      stop: (t: number) => void (node.stoppedAt = t),
    }
  }

  createBiquadFilter() {
    const node = this.record('biquad')
    return {
      ...this.connectable(node),
      type: 'bandpass' as BiquadFilterType,
      frequency: {
        get value() {
          return node.frequency ?? 0
        },
        set value(v: number) {
          node.frequency = v
        },
      },
      Q: { value: 1 },
    }
  }

  createBuffer(channels: number, length: number, rate: number) {
    const data = new Float32Array(length)
    return {
      getChannelData: () => data,
      length,
      sampleRate: rate,
      numberOfChannels: channels,
      duration: length / rate,
    }
  }
}

/** Install the mock as the page's AudioContext. Returns a restore function. */
export function installMockAudio(): () => void {
  const target = globalThis as unknown as { AudioContext?: unknown }
  const previous = target.AudioContext
  MockAudioContext.instances = []
  target.AudioContext = MockAudioContext
  return () => {
    target.AudioContext = previous
  }
}

/** Remove AudioContext entirely — the "browser refuses" case. */
export function removeAudio(): () => void {
  const target = globalThis as unknown as { AudioContext?: unknown }
  const previous = target.AudioContext
  delete target.AudioContext
  return () => {
    target.AudioContext = previous
  }
}

/** The single context the module under test created. */
export function lastContext(): MockAudioContext {
  const ctx = MockAudioContext.instances.at(-1)
  if (!ctx) throw new Error('no AudioContext was created')
  return ctx
}

export interface FakeDocument {
  listeners: Map<string, Set<(e?: unknown) => void>>
  addEventListener: (type: string, fn: (e?: unknown) => void) => void
  removeEventListener: (type: string, fn: (e?: unknown) => void) => void
  fire: (type: string) => void
  count: () => number
}

/** A document that only does what the unlock backstop needs. */
export function installFakeDocument(): { doc: FakeDocument; restore: () => void } {
  const listeners = new Map<string, Set<(e?: unknown) => void>>()
  const doc: FakeDocument = {
    listeners,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)?.add(fn)
    },
    removeEventListener: (type, fn) => {
      listeners.get(type)?.delete(fn)
    },
    fire: (type) => {
      for (const fn of [...(listeners.get(type) ?? [])]) fn()
    },
    count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  }
  const target = globalThis as unknown as { document?: unknown }
  const previous = target.document
  target.document = doc
  return {
    doc,
    restore: () => {
      target.document = previous
    },
  }
}
