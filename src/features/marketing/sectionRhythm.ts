/**
 * One vertical rhythm for every full-width section on the marketing landing.
 *
 * Showcase, HowItWorks, EverythingStrip and PricingTeaser each carried their
 * own padding values, so the scroll cadence stuttered between sections. Compose
 * this with a `max-w-*` of your choosing rather than hand-rolling padding.
 *
 * Lives in its own module so the lazily-imported sections don't have to import
 * from LandingPage (which would be a cycle).
 */
export const SECTION_RHYTHM = 'mx-auto w-full px-4 py-16 sm:px-6 sm:py-24'
