/**
 * Types for scripts/preflightLive.js.
 *
 * Same reasoning as scripts/supabaseTarget.d.ts: the module is plain ESM
 * because the CLI that runs it (scripts/preflight-live.mjs) is not TypeScript,
 * and duplicating it as .ts would mean two copies of the one rule that decides
 * whether the project may go live. `src/` IS type-checked, so the unit test that
 * pins the logic needs this file.
 */

export type PreflightStatus = 'pass' | 'fail' | 'skip'

export interface PreflightCheck {
  id: string
  title: string
  status: PreflightStatus
  detail: string
}

export interface ManualGate {
  flag: string
  title: string
  detail: string
}

export interface PreflightSummary {
  verdict: 'READY FOR LIVE' | 'NOT READY FOR LIVE'
  ready: boolean
  reasons: string[]
  failed: PreflightCheck[]
  skipped: PreflightCheck[]
  outstandingGates: ManualGate[]
}

export declare const REQUIRED_MIGRATIONS_BEFORE_LIVE: readonly string[]
export declare const VERCEL_FUNCTION_LIMIT: number
export declare const REQUIRED_ENDPOINTS: readonly string[]
export declare const EXPECTED_MONTHLY_USD: number
export declare const EXPECTED_YEARLY_USD: number
export declare const REQUIRED_FRAME_SRC: readonly string[]
export declare const MANUAL_GATES: readonly ManualGate[]

export declare function checkMigrationChain(filenames: string[]): PreflightCheck
export declare function checkFunctionBudget(apiTopLevelFiles: string[]): PreflightCheck
export declare function checkStripeCsp(csp: string): PreflightCheck
export declare function checkPricing(pricing: {
  monthlyUsd: number
  yearlyUsd: number
}): PreflightCheck
export declare function checkStripeEnv(
  env: Record<string, string | undefined>,
): PreflightCheck
export declare function summarise(
  checks: PreflightCheck[],
  acknowledgedFlags?: string[],
): PreflightSummary
