import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  // E2E (Playwright), serverless (/api), and config files run in Node.
  {
    files: ['e2e/**/*.ts', 'e2e-csp/**/*.ts', 'api/**/*.ts', 'playwright.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  /*
   * The prerender entry runs in Node at BUILD time and is never loaded by a
   * browser, so Fast Refresh — which is what `only-export-components` protects —
   * has nothing to do with it. Turning the rule off here is more honest than
   * splitting a build script into two files to satisfy a dev-server constraint
   * that does not apply to it.
   */
  {
    files: ['src/prerender/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'react-refresh/only-export-components': 'off' },
  },
)
