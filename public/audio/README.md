# Wellness audio

Drop licensed audio files for **Sleep sounds** and **Guided meditation** here.
Files in `public/` are served at the site root, so `public/audio/rain.mp3` is
reachable at `/audio/rain.mp3`.

## ⚠️ Licensing — read first

Do **not** add audio you don't have the right to use. Only add files that are:

- your own recordings,
- properly licensed for this use, or
- CC0 / public-domain.

No copyrighted audio is bundled in this repo. Until you add files, every track
shows an **"Audio coming soon"** state in the app (no broken players).

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
