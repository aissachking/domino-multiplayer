import { type GameAction, type GameState, applyAction, createMatch, legalMoves, startNextRound } from './engine.js';
import { mulberry32 } from './rng.js';

/**
 * Cross-implementation test vectors. A full match is played from a seed with a
 * trivial deterministic policy and every step is recorded. The Flutter engine
 * replays the same seeds and must reproduce every step exactly, which proves
 * offline (Dart) and online (TypeScript) rules are identical.
 */
export interface VectorStep {
  action: GameAction | { type: 'next-round' };
  digest: string;
}
export interface EngineVector {
  seed: number;
  players: string[];
  targetScore: number;
  initialHands: string[][];
  initialStock: string[];
  steps: VectorStep[];
  final: { phase: string; winnerId: string | null; scores: number[]; round: number; version: number };
}

export const digest = (s: GameState): string =>
  [
    s.version,
    s.round,
    s.phase,
    s.current,
    s.players.map((p) => `${p.score}:${p.hand.map((t) => t.id).join(',')}:${p.missing.join('')}`).join('|'),
    s.board.map((t) => `${t.left}${t.right}`).join(''),
    s.stock.length,
    s.openingTileId ?? '-',
    s.consecutivePasses,
  ].join('/');

/** First legal move in hand order; otherwise draw; otherwise pass. */
export function simpleAction(state: GameState): GameAction {
  const player = state.players[state.current];
  const move = legalMoves(state)[0];
  if (move) return { type: 'play', playerId: player.id, tileId: move.tileId, end: move.end };
  if (state.stock.length) return { type: 'draw', playerId: player.id };
  return { type: 'pass', playerId: player.id };
}

export function buildVector(seed: number, playerCount: number, targetScore = 50, maxSteps = 600): EngineVector {
  const random = mulberry32(seed);
  const players = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
  let state = createMatch(players, targetScore, random);
  const vector: EngineVector = {
    seed,
    players,
    targetScore,
    initialHands: state.players.map((p) => p.hand.map((t) => t.id)),
    initialStock: state.stock.map((t) => t.id),
    steps: [],
    final: { phase: '', winnerId: null, scores: [], round: 0, version: 0 },
  };
  for (let i = 0; i < maxSteps && state.phase !== 'match-over'; i++) {
    if (state.phase === 'round-over') {
      state = startNextRound(state, random);
      vector.steps.push({ action: { type: 'next-round' }, digest: digest(state) });
      continue;
    }
    const action = simpleAction(state);
    state = applyAction(state, action);
    vector.steps.push({ action, digest: digest(state) });
  }
  vector.final = {
    phase: state.phase,
    winnerId: state.winnerId,
    scores: state.players.map((p) => p.score),
    round: state.round,
    version: state.version,
  };
  return vector;
}

export const VECTOR_SEEDS = [1, 7, 42, 2026, 99991] as const;

export function buildAllVectors(): EngineVector[] {
  const out: EngineVector[] = [];
  for (const seed of VECTOR_SEEDS) for (const count of [2, 3, 4]) out.push(buildVector(seed, count));
  return out;
}
