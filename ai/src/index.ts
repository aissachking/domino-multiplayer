import {
  type End,
  type GameAction,
  type GameState,
  type PlacedTile,
  type RandomSource,
  type Tile,
  applyAction,
  createSet,
  isDouble,
  legalEndsFor,
  legalMoves,
  pips,
  shuffle,
} from '@daeef/game-engine';
import type { Difficulty } from '@daeef/shared';

/*
 * Bots only ever see a BotView: their own hand plus public information
 * (board, stock size, opponents' tile counts and the values they were seen
 * missing). They can never read another player's private hand.
 * Mirrored in mobile/lib/ai/bot.dart.
 */

export interface BotOpponent {
  seat: number;
  id: string;
  tileCount: number;
  missing: number[];
  score: number;
}

export interface BotView {
  seat: number;
  playerId: string;
  hand: Tile[];
  board: PlacedTile[];
  openingTileId: string | null;
  stockCount: number;
  targetScore: number;
  score: number;
  /** Opponents in turn order starting with the next player. */
  opponents: BotOpponent[];
}

export interface BotMove {
  tile: Tile;
  end: End;
}

export interface BotOptions {
  random?: RandomSource;
  /** Upper bound for expert thinking time (ms). */
  timeBudgetMs?: number;
  /** Upper bound for expert simulations across all candidate moves. */
  maxSimulations?: number;
  now?: () => number;
}

export function botViewFor(state: GameState, seat: number): BotView {
  const me = state.players[seat];
  const n = state.players.length;
  const opponents: BotOpponent[] = [];
  for (let k = 1; k < n; k++) {
    const s = (seat + k) % n;
    const p = state.players[s];
    opponents.push({ seat: s, id: p.id, tileCount: p.hand.length, missing: [...p.missing], score: p.score });
  }
  return {
    seat,
    playerId: me.id,
    hand: me.hand.map((t) => ({ ...t })),
    board: state.board.map((t) => ({ ...t })),
    openingTileId: state.openingTileId,
    stockCount: state.stock.length,
    targetScore: state.targetScore,
    score: me.score,
    opponents,
  };
}

export function candidateMoves(view: BotView): BotMove[] {
  return view.hand.flatMap((tile) => legalEndsFor(view.board, view.openingTileId, tile).map((end) => ({ tile, end })));
}

/** Values exposed at both ends after playing `move`. */
export function endsAfter(board: readonly PlacedTile[], move: BotMove): [number, number] {
  if (!board.length) return [move.tile.a, move.tile.b];
  const left = board[0].left;
  const right = board[board.length - 1].right;
  if (move.end === 'left') return [move.tile.a === left ? move.tile.b : move.tile.a, right];
  return [left, move.tile.a === right ? move.tile.b : move.tile.a];
}

const countValue = (tiles: readonly Tile[], v: number) => tiles.filter((t) => t.a === v || t.b === v).length;

function normalScore(view: BotView, move: BotMove): number {
  return pips(move.tile) + (isDouble(move.tile) ? 4 : 0);
}

function hardScore(view: BotView, move: BotMove): number {
  const rest = view.hand.filter((t) => t.id !== move.tile.id);
  if (!rest.length) return 10_000; // dominoing out always wins the round
  const [l, r] = endsAfter(view.board, move);
  const boardAfter = [...view.board, move.tile];
  const next = view.opponents[0];
  let score = pips(move.tile) + (isDouble(move.tile) ? 3 : 0);
  // keep options open for my next turn
  score += 2 * rest.filter((t) => t.a === l || t.b === l || t.a === r || t.b === r).length;
  for (const v of l === r ? [l] : [l, r]) {
    const unseen = 7 - countValue(rest, v) - countValue(boardAfter, v);
    if (next && next.missing.includes(v)) score += 4; // the next player cannot follow this value
    if (unseen === 0) score += 2; // nobody else can hold this value
    score -= unseen * 0.3;
  }
  return score;
}

function pickBest(view: BotView, moves: BotMove[], scorer: (v: BotView, m: BotMove) => number): BotMove {
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const s = scorer(view, m);
    if (s > bestScore) {
      best = m;
      bestScore = s;
    }
  }
  return best;
}

// ------------------------------------------------------------ expert: Monte Carlo

/** Deals the unseen tiles to opponents consistently with their tile counts and known missing values. */
export function sampleWorld(view: BotView, random: RandomSource): GameState {
  const known = new Set([...view.hand.map((t) => t.id), ...view.board.map((t) => t.id)]);
  let pool = shuffle(
    createSet().filter((t) => !known.has(t.id)),
    random,
  );
  const hands = new Map<number, Tile[]>();
  // most constrained opponents pick first
  const order = [...view.opponents].sort((a, b) => b.missing.length - a.missing.length);
  for (const opp of order) {
    const hand: Tile[] = [];
    const ok = pool.filter((t) => !opp.missing.includes(t.a) && !opp.missing.includes(t.b));
    for (const t of ok) {
      if (hand.length >= opp.tileCount) break;
      hand.push(t);
    }
    // constraints may be unsatisfiable in a sample: relax them
    for (const t of pool) {
      if (hand.length >= opp.tileCount) break;
      if (!hand.includes(t)) hand.push(t);
    }
    const taken = new Set(hand.map((t) => t.id));
    pool = pool.filter((t) => !taken.has(t.id));
    hands.set(opp.seat, hand);
  }
  const playerCount = view.opponents.length + 1;
  const players = Array.from({ length: playerCount }, (_, seat) => {
    if (seat === view.seat) return { id: view.playerId, score: 0, hand: view.hand.map((t) => ({ ...t })), missing: [] };
    const opp = view.opponents.find((o) => o.seat === seat)!;
    return { id: opp.id, score: 0, hand: hands.get(seat)!, missing: [...opp.missing] };
  });
  return {
    schema: 1,
    version: 0,
    round: 1,
    phase: 'playing',
    targetScore: 200,
    players,
    board: view.board.map((t) => ({ ...t })),
    stock: pool,
    current: view.seat,
    starter: view.seat,
    openingTileId: view.openingTileId,
    consecutivePasses: 0,
    lastRound: null,
    winnerId: null,
    lastAction: null,
  };
}

function greedyAction(state: GameState): GameAction {
  const player = state.players[state.current];
  const moves = legalMoves(state);
  if (moves.length) {
    let best = moves[0];
    let bestScore = -1;
    for (const m of moves) {
      const t = player.hand.find((h) => h.id === m.tileId)!;
      const s = pips(t) + (isDouble(t) ? 4 : 0);
      if (s > bestScore) {
        best = m;
        bestScore = s;
      }
    }
    return { type: 'play', playerId: player.id, tileId: best.tileId, end: best.end };
  }
  return state.stock.length ? { type: 'draw', playerId: player.id } : { type: 'pass', playerId: player.id };
}

/** Plays the round out with a greedy policy; returns my net outcome. */
function playout(state: GameState, me: string): number {
  let s = state;
  for (let i = 0; i < 300 && s.phase === 'playing'; i++) s = applyAction(s, greedyAction(s));
  const result = s.lastRound;
  if (!result) return 0;
  if (result.winnerId === me) return result.points;
  const mine = result.hands.find((h) => h.playerId === me)?.pips ?? 0;
  return -result.points * 0.5 - mine;
}

function expertMove(view: BotView, moves: BotMove[], opts: Required<Pick<BotOptions, 'random' | 'timeBudgetMs' | 'maxSimulations' | 'now'>>): BotMove {
  if (moves.length === 1) return moves[0];
  if (view.hand.length === 1) return moves[0];
  const totals = new Array(moves.length).fill(0);
  const counts = new Array(moves.length).fill(0);
  const started = opts.now();
  let sims = 0;
  outer: while (sims < opts.maxSimulations) {
    const world = sampleWorld(view, opts.random); // same world for every candidate: fair comparison
    for (let i = 0; i < moves.length; i++) {
      if (opts.now() - started > opts.timeBudgetMs || sims >= opts.maxSimulations) break outer;
      const m = moves[i];
      const after = applyAction(world, { type: 'play', playerId: view.playerId, tileId: m.tile.id, end: m.end });
      totals[i] += playout(after, view.playerId);
      counts[i] += 1;
      sims++;
    }
  }
  let best = -1;
  let bestValue = -Infinity;
  for (let i = 0; i < moves.length; i++) {
    if (!counts[i]) continue;
    // small heuristic tie-breaker keeps choices stable with few samples
    const value = totals[i] / counts[i] + hardScore(view, moves[i]) * 0.01;
    if (value > bestValue) {
      bestValue = value;
      best = i;
    }
  }
  return best >= 0 ? moves[best] : pickBest(view, moves, hardScore);
}

export const DEFAULT_EXPERT_BUDGET_MS = 180;
export const DEFAULT_EXPERT_SIMULATIONS = 600;

export function chooseAction(view: BotView, level: Difficulty, options: BotOptions = {}): GameAction {
  const random = options.random ?? Math.random;
  const moves = candidateMoves(view);
  if (!moves.length) return view.stockCount > 0 ? { type: 'draw', playerId: view.playerId } : { type: 'pass', playerId: view.playerId };
  let move: BotMove;
  switch (level) {
    case 'easy':
      move = moves[Math.floor(random() * moves.length)];
      break;
    case 'normal':
      move = pickBest(view, moves, normalScore);
      break;
    case 'hard':
      move = pickBest(view, moves, hardScore);
      break;
    case 'expert':
      move = expertMove(view, moves, {
        random,
        timeBudgetMs: options.timeBudgetMs ?? DEFAULT_EXPERT_BUDGET_MS,
        maxSimulations: options.maxSimulations ?? DEFAULT_EXPERT_SIMULATIONS,
        now: options.now ?? (() => performance.now()),
      });
      break;
    default:
      move = moves[0];
  }
  return { type: 'play', playerId: view.playerId, tileId: move.tile.id, end: move.end };
}

/**
 * Chooses and validates a bot action against the authoritative engine.
 * If the bot ever produced an invalid decision, a safe legal fallback is
 * used instead and `fallback` is reported so the caller can log it.
 */
export function decideBotAction(
  state: GameState,
  seat: number,
  level: Difficulty,
  options: BotOptions = {},
): { action: GameAction; next: GameState; fallback: boolean; error?: unknown } {
  const view = botViewFor(state, seat);
  try {
    const action = chooseAction(view, level, options);
    return { action, next: applyAction(state, action), fallback: false };
  } catch (error) {
    const action = greedyAction(state);
    return { action, next: applyAction(state, action), fallback: true, error };
  }
}

