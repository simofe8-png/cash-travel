// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Layer dependency direction (docs/ARCHITECTURE.md, ADR-0001):
//   ui → application → domain;  data → application/ports + domain;  infrastructure → data/application/domain;
//   composition wires everything. Violations are lint errors.
const platform = ['react', 'react-native', 'react-native-*', 'expo', 'expo-*', '@expo/*', 'node:*'];
const layer = (name) => [`**/${name}`, `**/${name}/**`];
// Tests (not shipped) may use Node built-ins and the src/testing harness.
const restrict = (files, groups, message) => ({
  files,
  ignores: ["**/*.test.ts", "**/*.test.tsx"],
  rules: { 'no-restricted-imports': ['error', { patterns: [{ group: groups, message }] }] },
});

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
  restrict(
    ['src/domain/**'],
    [...layer('application'), ...layer('data'), ...layer('infrastructure'), ...layer('ui'), ...layer('composition'), ...platform],
    'Domain is pure TypeScript and depends on nothing outside src/domain.',
  ),
  restrict(
    ['src/application/**'],
    [...layer('data'), ...layer('infrastructure'), ...layer('ui'), ...layer('composition'), ...platform],
    'Application depends only on domain and its own ports.',
  ),
  restrict(
    ['src/data/**'],
    [...layer('infrastructure'), ...layer('ui'), ...layer('composition'), ...platform],
    'Data layer is written against the SqlDatabase port only.',
  ),
  restrict(
    ['src/infrastructure/**'],
    [...layer('ui'), ...layer('composition')],
    'Infrastructure never depends on UI or the composition root.',
  ),
  restrict(
    ['src/ui/**', 'src/app/**'],
    [...layer('data'), ...layer('infrastructure'), 'expo-sqlite', 'expo-sqlite/*'],
    'UI reaches persistence only through application use-cases (no UI→SQLite access).',
  ),
]);
