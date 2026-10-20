import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', '.vite', '.tmp', '.npm-cache', '.scannerwork', 'node_modules', 'supabase/functions/**/index.ts'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      sonarjs.configs.recommended,
      jsxA11y.flatConfigs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'sonarjs/cognitive-complexity': ['error', 15],
      // Off in the sonarjs recommended preset; on here to match the standard in docs/QUALITY.md.
      'sonarjs/no-duplicate-string': 'error',
      'sonarjs/no-commented-code': 'error',
      'sonarjs/os-command': 'error',
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/prefer-immediate-return': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-eval': 'error',
    },
  },
  {
    // ISODateTime is a documentary alias of the shared contract; mirrored by sonar.issue.ignore.multicriteria.
    files: ['src/api/types.ts'],
    rules: { 'sonarjs/redundant-type-aliases': 'off' },
  },
  {
    // Sonar does not apply the duplicated-literal rule to test code either.
    files: ['**/*.test.{ts,tsx}', 'src/test-setup.ts'],
    rules: { 'sonarjs/no-duplicate-string': 'off' },
  },
);
