import { describe, it, expect } from 'vitest'
import {
  AUDIO_TRACKS,
  isGenerated,
  isTrackPlayable,
  resolveTrackSrc,
  tracksByCategory,
  type AudioTrack,
} from './tracks'
import { isNoiseKind } from './noise'

const make = (over: Partial<AudioTrack> = {}): AudioTrack => ({
  id: 't',
  title: 'T',
  description: 'd',
  category: 'sleep',
  ...over,
})

describe('resolveTrackSrc', () => {
  it('returns null when there is no source (=> "Audio coming soon")', () => {
    expect(resolveTrackSrc(make({ src: '' }))).toBeNull()
    expect(resolveTrackSrc(make({ src: '   ' }))).toBeNull()
    expect(resolveTrackSrc(make({ src: undefined }))).toBeNull()
  })

  it('serves a bare filename from /public/audio', () => {
    expect(resolveTrackSrc(make({ src: 'rain.mp3' }))).toBe('/audio/rain.mp3')
  })

  it('passes through a root-absolute path and a full URL', () => {
    expect(resolveTrackSrc(make({ src: '/audio/x.mp3' }))).toBe('/audio/x.mp3')
    expect(resolveTrackSrc(make({ src: 'https://cdn.example.com/x.mp3' }))).toBe(
      'https://cdn.example.com/x.mp3',
    )
  })
})

describe('manifest invariants', () => {
  it('has unique ids and valid categories', () => {
    const ids = AUDIO_TRACKS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of AUDIO_TRACKS) {
      expect(['sleep', 'meditation']).toContain(t.category)
    }
  })

  it('still ships NO bundled audio FILE — that has not changed', () => {
    // The repo bundles no copyrighted audio and never will. Every track's
    // `src` is empty; what changed is that emptiness is no longer the same
    // question as "can this play".
    for (const t of AUDIO_TRACKS) {
      expect(resolveTrackSrc(t), `${t.id} has a bundled file`).toBeNull()
    }
  })

  it('exposes both sleep and meditation tracks', () => {
    expect(tracksByCategory('sleep').length).toBeGreaterThan(0)
    expect(tracksByCategory('meditation').length).toBeGreaterThan(0)
  })
})

describe('generated versus recorded', () => {
  /*
   * This test used to read "every track is coming soon" and pass, which was
   * true and is now the wrong question. Three tracks are GENERATED: they carry
   * no file and are playable anyway, because the sound is arithmetic. The rest
   * are RECORDINGS nobody has licensed. Getting that distinction wrong in
   * either direction is a lie on a marketing page, so it is pinned here.
   */
  const GENERATED = ['white-noise', 'pink-noise', 'brown-noise']

  it('exactly the three noise tracks are generated, and they are playable', () => {
    const generated = AUDIO_TRACKS.filter(isGenerated).map((t) => t.id)
    expect(generated.sort()).toEqual([...GENERATED].sort())
    for (const t of AUDIO_TRACKS.filter(isGenerated)) {
      expect(isTrackPlayable(t), `${t.id} should be playable`).toBe(true)
      expect(t.generator).toBeTruthy()
      expect(isNoiseKind(t.generator)).toBe(true)
    }
  })

  it('every OTHER track is honestly unplayable until a file arrives', () => {
    for (const t of AUDIO_TRACKS.filter((x) => !isGenerated(x))) {
      expect(isTrackPlayable(t), `${t.id} claims to be playable with no file`).toBe(false)
    }
  })

  it('the three colours are distinct, so no two tracks are the same sound', () => {
    const kinds = AUDIO_TRACKS.filter(isGenerated).map((t) => t.generator)
    expect(new Set(kinds).size).toBe(3)
  })

  it('a file-backed track would be playable too, so the predicate is not noise-only', () => {
    expect(isTrackPlayable(make({ src: 'rain.mp3' }))).toBe(true)
    expect(isTrackPlayable(make({ src: '' }))).toBe(false)
  })

  it('the recorded sleep tracks are still named, so the honest state is visible', () => {
    const recorded = AUDIO_TRACKS.filter((t) => t.category === 'sleep' && !isGenerated(t)).map(
      (t) => t.id,
    )
    expect(recorded).toEqual(['rain', 'thunderstorm', 'ocean'])
  })
})
