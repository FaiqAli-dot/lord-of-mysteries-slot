import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      if (!addr || typeof addr === 'string') {
        s.close();
        reject(new Error('no port'));
        return;
      }
      const port = addr.port;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

/** Resolve tsx CLI without relying on `npx` being on PATH (fails in some CI images). */
function tsxCliPath(): string {
  return require.resolve('tsx/cli');
}

describe('server API', () => {
  let child: ChildProcess;
  let BASE = '';

  beforeAll(async () => {
    const PORT = await freePort();
    BASE = `http://127.0.0.1:${PORT}`;
    child = spawn(
      process.execPath,
      [tsxCliPath(), path.join('server', 'index.ts')],
      {
        cwd: process.cwd(),
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    // Wait for listen
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const t = setTimeout(() => {
        if (!settled) reject(new Error('server start timeout'));
      }, 20000);
      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        if (err) reject(err);
        else resolve();
      };
      const onData = (buf: Buffer) => {
        const s = String(buf);
        if (s.includes('listening')) done();
        if (/EADDRINUSE|Cannot find module|ERR_/.test(s)) done(new Error(s));
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      child.once('exit', (code) => {
        if (!settled) done(new Error(`server exited early: ${code}`));
      });
      child.once('error', (err) => done(err));
    });
  }, 25000);

  afterAll(() => {
    child?.kill('SIGTERM');
  });

  it('GET /health', async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('creates session, spins, updates balance authoritatively', async () => {
    const created = await fetch(`${BASE}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(created.status).toBe(201);
    const { sessionId, state } = (await created.json()) as {
      sessionId: string;
      state: { balance: number; bet: number };
    };
    expect(sessionId).toBeTruthy();
    const before = state.balance;

    const spun = await fetch(`${BASE}/api/session/${sessionId}/spin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(spun.status).toBe(200);
    const after = (await spun.json()) as {
      state: { balance: number; spinCount: number; lastPayout: number; bet: number };
    };
    expect(after.state.spinCount).toBe(1);
    expect(after.state.balance).toBe(before - after.state.bet + after.state.lastPayout);
  });

  it('CORS allows GitHub Pages origin and tunnel bypass header', async () => {
    const res = await fetch(`${BASE}/health`, {
      headers: {
        Origin: 'https://faiqali-dot.github.io',
        'Bypass-Tunnel-Reminder': 'true',
      },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://faiqali-dot.github.io',
    );

    const preflight = await fetch(`${BASE}/api/session`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://faiqali-dot.github.io',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,bypass-tunnel-reminder',
      },
    });
    expect(preflight.status).toBe(204);
    const allowHeaders = (preflight.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    expect(allowHeaders).toContain('bypass-tunnel-reminder');
  });
});
