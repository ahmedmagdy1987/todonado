import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // `api/` is covered too — the serverless handlers were previously untested
    // AND untypechecked, which is how a module-load crash reached production.
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
    // Refuses in CI if the environment could steer any test at a hosted
    // Supabase project. See vitest.globalSetup.mjs.
    globalSetup: ['./vitest.globalSetup.mjs'],
  },
})
