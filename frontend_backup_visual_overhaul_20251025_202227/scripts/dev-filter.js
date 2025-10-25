// scripts/dev-filter.js (v2) — print ONLY lines containing `"tag"`
// Cross-platform runner

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const isWin = process.platform === 'win32';
const runner = isWin ? 'npm.cmd' : 'npm';
const args = ['run', 'dev'];

const child = spawn(runner, args, {
  shell: true,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

const logPath = path.resolve(process.cwd(), 'tag.log');
const out = fs.createWriteStream(logPath, { flags: 'a' });

function emitOnlyTag(buf) {
  const text = buf.toString();
  // split lines to handle partial buffers
  for (const line of text.split(/\r?\n/)) {
    if (line.includes('"tag"')) {
      console.log(line);
      try { out.write(line + '\n'); } catch {}
    }
  }
}

child.stdout.on('data', emitOnlyTag);
child.stderr.on('data', emitOnlyTag);

child.on('close', (code) => {
  out.end();
  process.exit(code ?? 0);
});
