import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;

describe('server API', () => {
  let child: ChildProcess;

  beforeAll(async () => {
    child = spawn('npx', ['tsx', 'server/index.ts'], {
      cwd: '/workspace',
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Wait for listen
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('server start timeout')), 15000);
      child.stdout?.on('data', (buf: Buffer) => {
        if (String(buf).includes('listening')) {
          clearTimeout(t);
          resolve();
        }
      });
      child.stderr?.on('data', (buf: Buffer) => {
        const s = String(buf);
        if (s.toLowerCase().includes('error')) {
          clearTimeout(t);
          reject(new Error(s));
        }
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
