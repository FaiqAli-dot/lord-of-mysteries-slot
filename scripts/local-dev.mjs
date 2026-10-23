/**
 * Start authoritative API + Vite client pointed at it.
 * Usage: npm run local
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kids = [];

function run(cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  kids.push(child);
  return child;
}

console.log('Starting API on :8787 and Vite with VITE_API_BASE…');
run('npx', ['tsx', 'server/index.ts']);
run('npx', ['vite'], {
  VITE_BASE: '/',
  VITE_API_BASE: 'http://127.0.0.1:8787',
});

function shutdown() {
  for (const c of kids) {
    try {
      c.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
