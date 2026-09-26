const { spawnSync } = require('node:child_process');

const runGit = args => spawnSync('git', ['-c', 'safe.directory=C:/Users/HT-UA/Desktop/cn-ua-net', ...args], {
  encoding: 'utf8',
  windowsHide: true,
});

const diff = runGit(['diff', '--exit-code', 'HEAD', '--', 'public']);
if (diff.error) throw diff.error;
if (diff.status !== 0) {
  console.error('Generated public/ differs from the committed build. Commit the output of npm run build.');
  if (diff.stdout) console.error(diff.stdout);
  if (diff.stderr) console.error(diff.stderr);
  process.exit(1);
}

const untracked = runGit(['ls-files', '--others', '--exclude-standard', '--', 'public']);
if (untracked.error) throw untracked.error;
if (untracked.status !== 0) throw new Error(untracked.stderr || 'Unable to inspect untracked public files.');
if (untracked.stdout.trim()) {
  console.error('Generated public/ contains untracked files:');
  console.error(untracked.stdout.trim());
  process.exit(1);
}

console.log('PASS: generated public/ matches the committed build.');
