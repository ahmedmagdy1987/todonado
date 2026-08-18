/**
 * THE HERO'S BACKGROUND, REBUILT AS STRUCTURE INSTEAD OF WEATHER.
 *
 * ── WHAT IT REPLACES, AND WHY THAT HAD TO GO ───────────────────────────────
 *
 * The hero carried two animated layers: an aurora of three blurred colour blobs
 * drifting on parallax planes, and a "vortex" of concentric rings and orbiting
 * dots. Both were carefully built. Together they produced exactly the thing the
 * owner rejected twice: a dark page with a soft purple glow and floating shapes
 * behind a rectangular card, which is the single most common look in SaaS
 * marketing and reads as generic no matter how well it is executed.
 *
 * The specific failure was muddiness. A large blurred blob at low alpha over
 * near-black does not produce depth; it produces a mid-tone haze with no edge
 * anywhere in it. On desktop that haze sat directly between the headline and
 * the product card, so the two things that matter were separated by fog. On a
 * phone it was invisible, which meant the page paid for animation it never got
 * to show.
 *
 * ── THE REPLACEMENT: EDGES, NOT CLOUDS ─────────────────────────────────────
 *
 * Three static layers, no animation, no blur, nothing that moves:
 *
 *   1  A DOT LATTICE. A 1px dot on a 22px grid at 5.5% white, masked so it is
 *      densest behind the headline and gone by the edges. It is the layer that
 *      does the actual work: a regular grid reads as measured, engineered and
 *      deliberate, which is the product's whole argument, and it gives the eye
 *      something with an EDGE to resolve against instead of a gradient.
 *
 *   2  ONE CONTAINED SPOTLIGHT. A single radial from above the headline, violet
 *      at 14%, with a short falloff so it ends rather than fades forever. Its
 *      job is to put the brightest point of the screen exactly where the eye
 *      should start, and then stop. The aurora had three of these, all moving,
 *      none of them agreeing on a focal point.
 *
 *   3  A HORIZON. A hairline across the bottom of the hero, brightest at the
 *      centre. It is what makes the hero read as a defined space with a floor
 *      rather than as the top of an endless dark field, and it does the section
 *      separation the old page tried to do with a colour wash.
 *
 * ── WHY STATIC IS THE UPGRADE, NOT THE COMPROMISE ──────────────────────────
 *
 * Motion in the background competes with motion in the product story, and the
 * story is the thing a visitor needs to read. Removing the animation costs one
 * scroll listener, one rAF loop, fourteen animated specks and two `will-change`
 * layers, and it means the only thing moving on the first screen is the plan
 * assembling itself. That is a hierarchy decision, not a performance one, and
 * the performance is a bonus.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="hero-backdrop">
      <span className="hero-backdrop__lattice" />
      <span className="hero-backdrop__spot" />
      <span className="hero-backdrop__horizon" />
    </div>
  )
}
