/**
 * Server-authoritative Pathways of the Sealed API.
 * Uses the same engine/config as the client simulator.
 *
 * Start: `npm run server` (PORT default 8787)
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { GAME_CONFIG, type BonusModeId } from '../src/config/gameConfig.ts';
import { SlotGame } from '../src/engine/game.ts';
import { toPublicState } from '../src/api/publicState.ts';

const PORT = Number(process.env.PORT ?? 8787);
const VERSION = '1.0.0';

const DEFAULT_ORIGINS = [
  'https://faiqali-dot.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

function allowedOrigins(): string[] {
  const extra = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

interface Session {
  id: string;
  game: SlotGame;
  createdAt: number;
  lastAccess: number;
}

const sessions = new Map<string, Session>();

function newSessionId(): string {
  return randomBytes(16).toString('hex');
}

function getSession(id: string): Session | null {
  const s = sessions.get(id);
  if (!s) return null;
  s.lastAccess = Date.now();
  return s;
}

function createSession(): Session {
  const id = newSessionId();
  const game = new SlotGame({ persist: false });
  const session: Session = {
    id,
    game,
    createdAt: Date.now(),
    lastAccess: Date.now(),
  };
  sessions.set(id, session);
  return session;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const origins = allowedOrigins();
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    // Tunnel interstitial bypass headers so Pages → tunnel API preflight succeeds.
    'Access-Control-Allow-Headers':
      'Content-Type, Accept, Bypass-Tunnel-Reminder, bypass-tunnel-reminder, ngrok-skip-browser-warning',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  // Echo only allowlisted origins (Pages + localhost). No Origin → * for curl/health.
  if (origin && origins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else if (!origin) {
    headers['Access-Control-Allow-Origin'] = '*';
  }
  return headers;
}

function json(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  origin: string | null,
): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(origin),
  });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function parseJson(
  req: http.IncomingMessage,
): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
}

function sessionPayload(session: Session) {
  return {
    sessionId: session.id,
    state: toPublicState(session.game.state),
  };
}

const server = http.createServer(async (req, res) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;

  try {
    if (req.method === 'GET' && path === '/health') {
      json(
        res,
        200,
        {
          ok: true,
          service: 'pathways-of-the-sealed',
          version: VERSION,
          time: new Date().toISOString(),
          sessions: sessions.size,
          title: GAME_CONFIG.title,
        },
        origin,
      );
      return;
    }

    if (req.method === 'POST' && path === '/api/session') {
      const session = createSession();
      json(res, 201, sessionPayload(session), origin);
      return;
    }

    const sessionMatch = path.match(/^\/api\/session\/([^/]+)(?:\/(.*))?$/);
    if (sessionMatch) {
      const id = decodeURIComponent(sessionMatch[1]!);
      const action = sessionMatch[2] ?? '';
      const session = getSession(id);
      if (!session) {
        json(res, 404, { error: 'Session not found' }, origin);
        return;
      }
      const g = session.game;

      if (req.method === 'GET' && action === '') {
        json(res, 200, sessionPayload(session), origin);
        return;
      }

      if (req.method === 'POST' && action === 'spin') {
        const result = g.spin();
        if (!result && g.state.phase === 'IDLE') {
          json(res, 400, { error: 'Cannot spin', state: toPublicState(g.state) }, origin);
          return;
        }
        json(res, 200, sessionPayload(session), origin);
        return;
      }

      if (req.method === 'POST' && action === 'bet') {
        const body = await parseJson(req);
        const bet = Number(body.bet);
        g.setBet(bet);
        json(res, 200, sessionPayload(session), origin);
        return;
      }

      if (req.method === 'POST' && action === 'bet/adjust') {
        const body = await parseJson(req);
        const dir = body.dir === -1 ? -1 : 1;
        g.adjustBet(dir);
        json(res, 200, sessionPayload(session), origin);
        return;
      }

      if (req.method === 'POST' && action === 'bonus/select') {
        const body = await parseJson(req);
        const mode = body.mode as BonusModeId;
        g.selectBonus(mode);
        json(res, 200, sessionPayload(session), origin);
        return;
      }

      if (req.method === 'POST' && action === 'bonus/spin') {
        const result = g.bonusSpin();
        if (!result && g.state.phase === 'BONUS_ACTIVE') {
          json(res, 400, { error: 'Cannot bonus-spin', state: toPublicState(g.state) }, origin);
          return;
        }
        json(res, 200, sessionPayload(session), origin);
        return;
      }

      if (req.method === 'POST' && action === 'tarot/pick') {
        const pick = g.tarotPick();
        if (!pick) {
          json(res, 400, { error: 'Cannot pick', state: toPublicState(g.state) }, origin);
          return;
        }
        json(res, 200, { ...sessionPayload(session), reward: pick.reward }, origin);
        return;
      }

      if (req.method === 'POST' && action === 'bonus/ack') {
        g.acknowledgeBonusSummary();
        json(res, 200, sessionPayload(session), origin);
        return;
      }

      if (req.method === 'POST' && action === 'reset') {
        g.resetDemo();
        json(res, 200, sessionPayload(session), origin);
        return;
      }

      if (req.method === 'POST' && action === 'mute') {
        const body = await parseJson(req);
        g.setMuted(Boolean(body.muted));
        json(res, 200, sessionPayload(session), origin);
        return;
      }
    }

    json(res, 404, { error: 'Not found' }, origin);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    json(
      res,
      status,
      { error: e instanceof Error ? e.message : 'Server error' },
      origin,
    );
  }
});

// Idle session cleanup (24h)
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, s] of sessions) {
    if (s.lastAccess < cutoff) sessions.delete(id);
  }
}, 60 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`Pathways API listening on http://0.0.0.0:${PORT}`);
  console.log(`Health: GET /health`);
  console.log(`CORS origins: ${allowedOrigins().join(', ')}`);
  console.log(`Demo credits — not real money. Engine: ${GAME_CONFIG.title}`);
});
