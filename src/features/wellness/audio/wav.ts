/**
 * Encode generated samples as a WAV, so the ordinary <audio> element can play
 * them.
 *
 * ── WHY A WAV AND NOT AN AudioBufferSourceNode ───────────────────────────────
 * The samples are generated exactly as an AudioBuffer would hold them, and
 * looping a buffer through an AudioBufferSourceNode is the shorter route to
 * "sound comes out". It was not chosen, and the reason is the requirement that
 * matters most for a SLEEP sound: it has to keep playing when the tab is hidden
 * and when the phone screen locks.
 *
 * A Web Audio graph with no media element is not a media session. Mobile
 * browsers suspend an AudioContext when the page is backgrounded (iOS Safari
 * reliably, others eventually), and they show no lock-screen controls for one,
 * because there is nothing they recognise as "media playing". A media element
 * is the substrate every platform already treats as audio worth keeping alive,
 * and it is what makes the Media Session metadata and the hardware pause button
 * work at all.
 *
 * Encoding the buffer to a WAV blob and handing it to the element the player
 * already owns gets both halves: generated audio with no file and no licence,
 * and the platform's real background-audio behaviour. Play, pause, volume, loop
 * and the sleep timer are then the SAME code paths the recorded tracks use, so
 * there is one player rather than two.
 *
 * The cost is memory, not bandwidth: six seconds of 44.1 kHz mono 16-bit is
 * about 500 kB held in a blob while a track is playing, and released when it
 * stops. Nothing is downloaded and nothing ships in the bundle.
 */

const BYTES_PER_SAMPLE = 2
const BITS_PER_SAMPLE = 16
const PCM_FORMAT = 1
const CHANNELS = 1

/** Clamp to the representable range, then scale to signed 16-bit. */
function toInt16(sample: number): number {
  if (!Number.isFinite(sample)) return 0
  const clamped = Math.max(-1, Math.min(1, sample))
  // Asymmetric on purpose: signed 16-bit runs -32768..32767, so scaling the
  // negative side by 32768 and the positive by 32767 uses the full range
  // without wrapping 1.0 round to the largest negative number.
  return Math.round(clamped < 0 ? clamped * 32768 : clamped * 32767)
}

/**
 * A mono 16-bit PCM WAV. Returns the bytes; the caller decides whether that
 * becomes a Blob, a data URL, or a file on disk in a test.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error(`encodeWav: sampleRate must be positive, got ${sampleRate}`)
  }
  const dataBytes = samples.length * BYTES_PER_SAMPLE
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true) // everything after this field
  ascii(8, 'WAVE')

  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM fmt chunk length
  view.setUint16(20, PCM_FORMAT, true)
  view.setUint16(22, CHANNELS, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * CHANNELS * BYTES_PER_SAMPLE, true) // byte rate
  view.setUint16(32, CHANNELS * BYTES_PER_SAMPLE, true) // block align
  view.setUint16(34, BITS_PER_SAMPLE, true)

  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)

  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(44 + i * BYTES_PER_SAMPLE, toInt16(samples[i]), true)
  }

  return new Uint8Array(buffer)
}

/** Read the samples back. Exists so a test can prove the header is honest. */
export function decodeWavSamples(bytes: Uint8Array): { sampleRate: number; samples: Float32Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const sampleRate = view.getUint32(24, true)
  const dataBytes = view.getUint32(40, true)
  const count = dataBytes / BYTES_PER_SAMPLE
  const samples = new Float32Array(count)
  for (let i = 0; i < count; i += 1) {
    const raw = view.getInt16(44 + i * BYTES_PER_SAMPLE, true)
    // The exact inverse of `toInt16`, asymmetry included. Dividing everything
    // by 32768 would look tidier and would introduce a systematic 1-in-32768
    // shrink on every positive sample, which is larger than the quantisation
    // error the round-trip test is trying to measure.
    samples[i] = raw < 0 ? raw / 32768 : raw / 32767
  }
  return { sampleRate, samples }
}

/** The four bytes at `offset`, as ASCII. For tests and for debugging a header. */
export function tagAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + 4))
}
