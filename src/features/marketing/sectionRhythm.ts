/**
 * The horizontal container for every block on the marketing landing.
 *
 * ── IT USED TO CARRY THE VERTICAL RHYTHM TOO, AND THAT WAS THE PROBLEM ─────
 *
 * This was `mx-auto w-full px-4 py-16 sm:px-6 sm:py-24`, applied by every
 * section on the page. One constant meant one spacing tier, and one tier means
 * NO HIERARCHY: a major turn in the argument and a supporting beat beneath it
 * were spaced identically, so nothing could group and nothing could read as a
 * chapter. An audit of the live page measured the result — eighteen sections,
 * none taking more than 11% of the page, all the same size, which is deck
 * pacing rather than landing-page pacing.
 *
 * It was also where most of the page's height went. Eighteen sections each
 * paying `py-16` at the top AND the bottom is roughly 2,300px of padding on a
 * phone, spent making unrelated things look related.
 *
 * The vertical rhythm now belongs to `Chapter` (the large tier) and `Beat` (the
 * small one), so grouping is expressed by spacing instead of fought by it. This
 * constant is horizontal only, and every existing caller keeps its gutters and
 * centring unchanged.
 */
export const SECTION_RHYTHM = 'mx-auto w-full px-4 sm:px-6'
