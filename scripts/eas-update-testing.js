#!/usr/bin/env node
// Publishes an EAS Update to the `testing` channel from verified, committed and pushed source only
// (ADR-0011). Usage: npm run update:testing -- "short description"
const { execSync } = require('node:child_process');

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const fail = (msg) => {
  console.error(`update:testing refused — ${msg}`);
  process.exit(1);
};

const description = process.argv.slice(2).join(' ').trim();
if (!description) fail('give a short description of the change');
if (sh('git status --porcelain')) fail('working tree is not clean (commit first)');
if (sh('git rev-parse --abbrev-ref HEAD') !== 'main') fail('not on branch main');
sh('git fetch --quiet origin main');
const head = sh('git rev-parse HEAD');
if (head !== sh('git rev-parse origin/main')) fail('HEAD is not pushed to origin/main');

process.stdout.write(`Verifying ${head} …\n`);
execSync('npm run verify', { stdio: 'inherit' });

const message = `${head.slice(0, 12)} ${description}`;
process.stdout.write(`Publishing to channel "testing": ${message}\n`);
execSync(`npx --yes eas-cli@24.11.0 update --channel testing --environment preview --platform android --non-interactive --message ${JSON.stringify(message)}`, {
  stdio: 'inherit',
  // `--environment preview` only selects (empty) EAS-hosted env vars; never production.
  // Same build-time config as the TEST binary, so the fingerprint runtime version matches it.
  env: { ...process.env, CT_UPDATES_CHANNEL: 'testing' },
});
