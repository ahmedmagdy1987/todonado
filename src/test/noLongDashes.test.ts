import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

/**
 * NO EM DASHES, EN DASHES OR HORIZONTAL BARS IN ANYTHING A USER READS.
 *
 * An owner rule, and a defensible one: a long dash between clauses is the
 * single strongest tell that a sentence was written by a language model, and
 * this product's whole voice depends on sounding like a person wrote it. Once
 * one slips into a template title or an empty state it will be copied by the
 * next twenty, so the rule is enforced rather than remembered.
 *
 * ── WHAT COUNTS AS USER-FACING ───────────────────────────────────────────────
 * Everything except COMMENTS. In a `.tsx` file, text outside a comment is
 * either a string literal or JSX body text, and both reach the screen. In a
 * `.ts` file a bare dash outside a comment and outside a string would not
 * parse, so scanning the same way is safe there too.
 *
 * Comments are exempt on purpose: this repo explains itself in long prose
 * comments, they are read by developers rather than users, and rewriting them
 * would be churn with no reader-facing benefit.
 *
 * ── WHAT IS STILL ALLOWED ────────────────────────────────────────────────────
 * Ordinary hyphens in compound words — effort-aware, wish-list, quit-tracker —
 * are U+002D and are not touched by this rule. So are minus signs and ranges
 * written with a hyphen.
 */

const FORBIDDEN = /[—–―]/
const NAMES: Record<string, string> = {
  '—': 'em dash (U+2014)',
  '–': 'en dash (U+2013)',
  '―': 'horizontal bar (U+2015)',
}

const SRC = fileURLToPath(new URL('..', import.meta.url))
const ROOT = fileURLToPath(new URL('../..', import.meta.url))

/**
 * Every line whose content OUTSIDE a comment carries a long dash.
 *
 * A character-level state machine rather than a regex, because the question is
 * "is this inside a comment", and no regex answers that: `//` appears inside
 * every URL string in the codebase, and `*` inside plenty of them.
 */
export function longDashLines(source: string): { line: number; dash: string; text: string }[] {
  const lines = source.split('\n')
  const hits: { line: number; dash: string; text: string }[] = []
  let state: 'code' | 'line' | 'block' | "'" | '"' | '`' = 'code'
  let line = 0
  let i = 0

  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (ch === '\n') line += 1

    if (state === 'code') {
      if (ch === '/' && next === '/') { state = 'line'; i += 2; continue }
      if (ch === '/' && next === '*') { state = 'block'; i += 2; continue }
      if (ch === "'" || ch === '"' || ch === '`') { state = ch; i += 1; continue }
      if (FORBIDDEN.test(ch)) hits.push({ line: line + 1, dash: ch, text: lines[line] ?? '' })
    } else if (state === 'line') {
      if (ch === '\n') state = 'code'
    } else if (state === 'block') {
      if (ch === '*' && next === '/') { state = 'code'; i += 2; continue }
    } else {
      if (ch === '\\') { i += 2; continue }
      if (ch === state) { state = 'code'; i += 1; continue }
      if (FORBIDDEN.test(ch)) hits.push({ line: line + 1, dash: ch, text: lines[line] ?? '' })
    }
    i += 1
  }
  return hits
}

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry)) continue
      if (/\.test\.tsx?$/.test(entry)) continue
      out.push(full)
    }
  }
  walk(SRC)
  return out
}

const rel = (file: string) => file.replace(/\\/g, '/').split('/src/')[1] ?? file

describe('the scanner itself', () => {
  it('finds a dash in a string and in JSX text', () => {
    expect(longDashLines(`const a = 'one — two'`)).toHaveLength(1)
    expect(longDashLines(`<p>one — two</p>`)).toHaveLength(1)
    expect(longDashLines('const a = `one – two`')).toHaveLength(1)
  })

  it('ignores dashes inside comments, which no user reads', () => {
    expect(longDashLines(`// one — two`)).toEqual([])
    expect(longDashLines(`/* one — two */`)).toEqual([])
    expect(longDashLines(`/**\n * one — two\n */`)).toEqual([])
  })

  it('is not fooled by a URL inside a string', () => {
    // The `//` here must not start a comment, or the dash after it goes unseen.
    expect(longDashLines(`const u = 'https://x.test/a' + 'b — c'`)).toHaveLength(1)
  })

  it('leaves ordinary hyphens alone', () => {
    expect(longDashLines(`const a = 'effort-aware, wish-list, 9-5'`)).toEqual([])
  })
})

describe('no long dashes in anything a user reads', () => {
  it('src/ is clean', () => {
    const offenders: string[] = []
    for (const file of sourceFiles()) {
      for (const hit of longDashLines(readFileSync(file, 'utf8'))) {
        offenders.push(`${rel(file)}:${hit.line}  ${NAMES[hit.dash]}  ${hit.text.trim().slice(0, 90)}`)
      }
    }
    expect(
      offenders,
      `A long dash reads as machine-written. Rewrite the sentence — a comma, a colon, a full\n` +
        `stop or a pair of brackets is almost always better than the dash was:\n` +
        offenders.join('\n'),
    ).toEqual([])
  })

  it('the HTML shell, the manifest and the robots/sitemap files are clean', () => {
    const offenders: string[] = []
    for (const rf of [
      'index.html',
      'public/manifest.webmanifest',
      'public/robots.txt',
      'public/sitemap.xml',
    ]) {
      let text: string
      try {
        text = readFileSync(join(ROOT, rf), 'utf8')
      } catch {
        continue // not every file exists in every checkout
      }
      // Strip HTML/XML comments; everything left is served.
      const served = text.replace(/<!--[\s\S]*?-->/g, '')
      served.split('\n').forEach((lineText, idx) => {
        const match = lineText.match(FORBIDDEN)
        if (match) offenders.push(`${rf}:${idx + 1}  ${NAMES[match[0]]}  ${lineText.trim().slice(0, 90)}`)
      })
    }
    expect(offenders, `long dashes in shipped markup:\n${offenders.join('\n')}`).toEqual([])
  })
})
