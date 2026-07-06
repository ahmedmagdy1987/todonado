/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  // Billing (public, optional — absent = fake-door fallback). See stripeConfig.ts.
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string
  readonly VITE_STRIPE_PRICE_MONTHLY?: string
  readonly VITE_STRIPE_PRICE_YEARLY?: string
  // Dev-only global Pro preview (never set in production). See billing/plan.ts.
  readonly VITE_PRO_PREVIEW?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
