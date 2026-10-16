const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Keep Vercel's buildCommand short while running every required check.
const checks = [
  ['--check', 'SchoolShield/analytics.js'],
  ['--check', 'SchoolShield/app.js'],
  ['--check', 'SchoolShield/supabase-client.js'],
  ['--check', 'SchoolShield/supabase-config.js'],
  ['--test', 'tests/chat.test.cjs', 'tests/portal-scope.test.cjs',
    'tests/security-shifts.test.cjs', 'tests/security-evidence.test.cjs'],
];

for (const args of checks) {
  const result = spawnSync(process.execPath, args, {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
  });
  if (result.error) console.error(result.error.message);
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
