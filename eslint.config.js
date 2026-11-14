const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs', globals: { __dirname: 'readonly', __filename: 'readonly' } } },
  { ignores: ['Apps/Store/**', 'dist/**', 'test-results/**', 'playwright-report/**', '.venv/**', '.data/**', '.venv-context/**', 'work/**', '.hallmark/**', 'desktop/.hallmark/**'] },
]);
