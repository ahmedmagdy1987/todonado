# Wellness audio

Drop licensed audio files for the **recorded** sleep ambience and for **Guided
meditation** here. Files in `public/` are served at the site root, so
`public/audio/rain.mp3` is reachable at `/audio/rain.mp3`.

## This folder is no longer the only way to make a sound

White, pink and brown noise are **generated on the device** and need no file at
all. `src/features/wellness/audio/noise.ts` produces the samples, `wav.ts`
wraps them in a WAV header, and the player is handed a `blob:` URL. Nothing is
downloaded, nothing is licensed, and nothing belongs in this folder for them.

So the empty-`src` rule below applies to RECORDINGS: rain, thunderstorm, ocean
and the meditation sessions. A track is playable if it has a `src` **or** a
`generator`; see `isTrackPlayable` in `tracks.ts`. Do not "fix" a generated
track by dropping a noise file in here — it would be a strictly worse version
of something that already works, and a megabyte of bundle for it.

## ⚠️ Licensing — read first

Do **not** add audio you don't have the right to use. Only add files that are:

- your own recordings,
- properly licensed for this use, or
- CC0 / public-domain.

No copyrighted audio is bundled in this repo. Until you add files, every
**recorded** track shows an **"Audio coming soon"** state in the app (no broken
players). The three generated noise tracks are unaffected and always play.

## How to enable a track

1. Put the file here, e.g. `public/audio/rain.mp3`.
2. In `src/features/wellness/audio/tracks.ts`, set that track's `src`:
   - a filename/path served from this folder — `src: 'rain.mp3'` → `/audio/rain.mp3`, or
   - a full public URL (e.g. a **Supabase Storage** public object URL) —
     `src: 'https://<project>.supabase.co/storage/v1/object/public/audio/rain.mp3'`.

Both forms are supported by `resolveTrackSrc()`; a bare name is served from
`/audio`, while absolute paths and `http(s)` URLs pass through unchanged.

Recommended: short, seamless loops for sleep sounds (the player loops them by
default); full-length files for guided meditation (shows a progress bar).
