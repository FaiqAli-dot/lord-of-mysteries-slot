import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

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

describe('server API', () => {
  let child: ChildProcess;
  let BASE = '';

  beforeAll(async () => {
    const PORT = await freePort();
    BASE = `http://127.0.0.1:${PORT}`;
    child = spawn('npx', ['tsx', 'server/index.ts'], {
      cwd: '/workspace',
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Wait for listen
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const t = setTimeout(() => {
        if (!settled) reject(new Error('server start timeout'));
      }, 15000);
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
        if (/EADDRINUSE/.test(s)) done(new Error(s));
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      child.once('exit', (code) => {
        if (!settled) done(new Error(`server exited early: ${code}`));
      });
    });
  }, 20000);

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

  it('CORS allows GitHub Pages origin', async () => {
    const res = await fetch(`${BASE}/health`, {
      headers: { Origin: 'https://faiqali-dot.github.io' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://faiqali-dot.github.io',
    );
  });
});
