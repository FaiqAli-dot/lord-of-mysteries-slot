import { GAME_CONFIG, SYMBOLS, type SymbolId } from '../config/gameConfig';
import type { Grid } from './types';
import { cloneGrid } from './reels';

/**
 * Fool's Mirror expansion:
 * Only the configured middle reel (Reel 3 / index 2) expands to a full column
 * when ≥1 WILD lands there and the reel has no Scatter. Lines using the
 * expanded reel get expandedMultiplier (2×) once.
 */
export function applyWildExpansion(grid: Grid): {
  grid: Grid;
  expandedReels: number[];
} {
  if (!GAME_CONFIG.wild.expandWhenPresent) {
    return { grid: cloneGrid(grid), expandedReels: [] };
  }

  const next = cloneGrid(grid);
  const expandedReels: number[] = [];
  const onlyReel = GAME_CONFIG.wild.expandReelOnly;

  for (let r = 0; r < next.length; r++) {
    if (onlyReel != null && r !== onlyReel) continue;
    const reel = next[r]!;
    const hasWild = reel.some((s) => s === 'WILD');
    const hasScatter = reel.some((s) => s === 'SCATTER');
    if (hasWild && !hasScatter) {
      for (let row = 0; row < reel.length; row++) {
        const s = reel[row]!;
        if (
          s !== 'SEQUENCE' &&
          s !== 'SPIRIT' &&
          s !== 'GLOVE' &&
          s !== 'MONSTER'
        ) {
          reel[row] = 'WILD';
        }
      }
      expandedReels.push(r);
    }
  }

  return { grid: next, expandedReels };
}

/** Apply Locked Wild positions onto the grid (before evaluation). */
export function applyLockedWilds(
  grid: Grid,
  locked: { reel: number; row: number }[],
): Grid {
  const next = cloneGrid(grid);
  for (const lw of locked) {
    const cell = next[lw.reel]?.[lw.row];
    if (cell && cell !== 'SCATTER') {
      next[lw.reel]![lw.row] = 'WILD';
    }
  }
  return next;
}

export function applyGlove(
  grid: Grid,
  reel: number,
  row: number,
): Grid {
  const next = cloneGrid(grid);
  const s = next[reel]?.[row];
  if (!s) return next;
  const blocked = GAME_CONFIG.wild.cannotSubstitute as readonly SymbolId[];
  if (blocked.includes(s) || s === 'WILD') return next;
  next[reel]![row] = 'WILD';
  return next;
}

/**
 * Relative payout rank for Grafting.
 * Wild ranks above every paying symbol (never “lose” to a high).
 * Specials that are not Wild are excluded from ranking (not candidates).
 */
export function symbolPayRank(id: SymbolId): number {
  if (id === 'WILD') return Number.POSITIVE_INFINITY;
  const def = SYMBOLS[id];
  if (!def) return -1;
  if (def.tier === 'high' || def.tier === 'low') {
    // 5-of-a-kind multiple as primary rank
    return def.pays[2]!;
  }
  return -1;
}

function neighborOffsets(): { dr: number; drow: number }[] {
  const cfg = GAME_CONFIG.spirituality.grafting;
  const offsets: { dr: number; drow: number }[] = [];
  if (cfg.orthogonal) {
    offsets.push(
      { dr: -1, drow: 0 },
      { dr: 1, drow: 0 },
      { dr: 0, drow: -1 },
      { dr: 0, drow: 1 },
    );
  }
  if (cfg.diagonals) {
    offsets.push(
      { dr: -1, drow: -1 },
      { dr: -1, drow: 1 },
      { dr: 1, drow: -1 },
      { dr: 1, drow: 1 },
    );
  }
  return offsets;
}

/**
 * Grafting: pick an anchor + orthogonal neighbors, then transform the cluster
 * into the highest-paying symbol among them.
 *
 * Rules:
 * - Rank by paytable (5-oak); WILD ranks highest.
 * - Never overwrite SCATTER / SEQUENCE / SPIRIT / GLOVE / MONSTER.
 * - Never convert a WILD into a lower-paying symbol.
 * - If the winning target is WILD, transformable neighbors become WILD.
 */
export function applyGraftingCluster(
  grid: Grid,
  rngPick: <T>(items: T[]) => T,
  forcedAnchor?: { reel: number; row: number },
): {
  grid: Grid;
  seed: { reel: number; row: number } | null;
  positions: { reel: number; row: number }[];
  targetSymbol: SymbolId | null;
  cluster: { reel: number; row: number }[];
} {
  const blocked = new Set(
    GAME_CONFIG.spirituality.grafting.cannotTransform as readonly SymbolId[],
  );
  const next = cloneGrid(grid);

  // Anchors: any cell that can participate in ranking (paying or wild).
  const anchors: { reel: number; row: number }[] = [];
  for (let r = 0; r < next.length; r++) {
    for (let row = 0; row < next[r]!.length; row++) {
      const s = next[r]![row]!;
      if (blocked.has(s)) continue;
      if (symbolPayRank(s) < 0 && s !== 'WILD') continue;
      anchors.push({ reel: r, row });
    }
  }

  if (anchors.length === 0 && !forcedAnchor) {
    return {
      grid: next,
      seed: null,
      positions: [],
      targetSymbol: null,
      cluster: [],
    };
  }

  const seed =
    forcedAnchor ??
    rngPick(anchors.length > 0 ? anchors : [{ reel: 0, row: 0 }]);

  const cluster: { reel: number; row: number }[] = [{ ...seed }];
  for (const { dr, drow } of neighborOffsets()) {
    const reel = seed.reel + dr;
    const row = seed.row + drow;
    if (reel < 0 || reel >= next.length) continue;
    if (row < 0 || row >= next[reel]!.length) continue;
    cluster.push({ reel, row });
  }

  // Rank candidates among cluster (skip blocked specials for ranking source,
  // but they still occupy space and are never overwritten).
  let bestRank = -1;
  let targetSymbol: SymbolId | null = null;
  for (const c of cluster) {
    const s = next[c.reel]![c.row]!;
    if (blocked.has(s)) continue;
    const rank = symbolPayRank(s);
    if (rank > bestRank) {
      bestRank = rank;
      targetSymbol = s;
    }
  }

  if (!targetSymbol || bestRank < 0) {
    return {
      grid: next,
      seed,
      positions: [],
      targetSymbol: null,
      cluster,
    };
  }

  const transformed: { reel: number; row: number }[] = [];
  for (const c of cluster) {
    const s = next[c.reel]![c.row]!;
    if (blocked.has(s)) continue;
    // Never downgrade Wild
    if (s === 'WILD' && targetSymbol !== 'WILD') continue;
    if (s === targetSymbol) continue;
    next[c.reel]![c.row] = targetSymbol;
    transformed.push(c);
  }

  return {
    grid: next,
    seed,
    positions: transformed,
    targetSymbol,
    cluster,
  };
}

/** @deprecated Use applyGraftingCluster — kept for transitional call sites. */
export function applyGraftingLink(
  grid: Grid,
  rngPick: <T>(items: T[]) => T,
): {
  grid: Grid;
  seed: { reel: number; row: number } | null;
  linked: { reel: number; row: number }[];
  placedPair: boolean;
  targetSymbol: SymbolId | null;
} {
  const r = applyGraftingCluster(grid, rngPick);
  return {
    grid: r.grid,
    seed: r.seed,
    linked: r.positions,
    placedPair: false,
    targetSymbol: r.targetSymbol,
  };
}

export function ensureGraftSeed(
  grid: Grid,
  seed: { reel: number; row: number },
): { grid: Grid; seed: { reel: number; row: number }; placed: boolean } {
  const next = cloneGrid(grid);
  const wasWild = next[seed.reel]![seed.row] === 'WILD';
  if (!wasWild) next[seed.reel]![seed.row] = 'WILD';
  return { grid: next, seed, placed: !wasWild };
}

/** Legacy orthogonal wild-spread helper (tests / cheats). */
export function applyGrafting(
  grid: Grid,
  seed: { reel: number; row: number },
): { grid: Grid; transformed: { reel: number; row: number }[] } {
  const r = applyGraftingCluster(grid, (items) => items[0]!, seed);
  return { grid: r.grid, transformed: r.positions };
}
