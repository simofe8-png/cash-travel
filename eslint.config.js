// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'coverage/*', 'android/*', 'ios/*'],
  },
  {
    rules: {
      // Production logging is minimal (docs/SECURITY.md).
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
]);
