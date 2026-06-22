import { describe, it, expect } from 'vitest'
import { AUDIO_TRACKS, resolveTrackSrc, tracksByCategory, type AudioTrack } from './tracks'

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

  it('ships with NO bundled audio — every track is "coming soon"', () => {
    for (const t of AUDIO_TRACKS) {
      expect(resolveTrackSrc(t)).toBeNull()
    }
  })

  it('exposes both sleep and meditation tracks', () => {
    expect(tracksByCategory('sleep').length).toBeGreaterThan(0)
    expect(tracksByCategory('meditation').length).toBeGreaterThan(0)
  })
})
