import { type RandomSource, shuffle } from './rng.js';

/*
 * Double-six domino engine — the single source of truth for the rules.
 * Every rule implemented here is documented in docs/RULES.md and mirrored
 * one-to-one by mobile/lib/engine/engine.dart (verified by shared test vectors).
 */

export type End = 'left' | 'right';
export const TARGET_SCORES = [50, 100, 150, 200] as const;
export type TargetScore = (typeof TARGET_SCORES)[number];
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const TILE_COUNT = 28;

export interface Tile {
  /** Orientation-independent identity: `${low}-${high}`. */
  id: string;
  a: number;
  b: number;
}

/** A tile on the board with its displayed orientation (left value / right value). */
export interface PlacedTile extends Tile {
  left: number;
  right: number;
}

export interface PlayerState {
  id: string;
  score: number;
  hand: Tile[];
  /** Public info: end values this player could not match this round (draws/passes). */
  missing: number[];
}

export type Phase = 'playing' | 'round-over' | 'match-over';

export interface RoundHand {
  playerId: string;
  pips: number;
  tiles: Tile[];
}

export interface RoundResult {
  round: number;
  winnerId: string;
  reason: 'domino' | 'blocked';
  points: number;
  hands: RoundHand[];
}

export type GameAction =
  | { type: 'play'; playerId: string; tileId: string; end: End }
  | { type: 'draw'; playerId: string }
  | { type: 'pass'; playerId: string };

export interface ActionRecord {
  type: GameAction['type'];
  playerId: string;
  tileId?: string;
  end?: End;
}

export interface GameState {
  schema: 1;
  /** Increments on every accepted action; used to reject stale client actions. */
  version: number;
  round: number;
  phase: Phase;
  targetScore: TargetScore;
  players: PlayerState[];
  board: PlacedTile[];
  stock: Tile[];
  current: number;
  starter: number;
  /** When set, the opening play of the round must be this tile (first round only). */
  openingTileId: string | null;
  consecutivePasses: number;
  lastRound: RoundResult | null;
  winnerId: string | null;
  lastAction: ActionRecord | null;
}

export type EngineErrorCode =
  | 'INVALID_PLAYERS'
  | 'INVALID_TARGET'
  | 'INVALID_ACTION'
  | 'UNKNOWN_PLAYER'
  | 'NOT_YOUR_TURN'
  | 'ROUND_OVER'
  | 'MATCH_OVER'
  | 'ROUND_NOT_OVER'
  | 'TILE_NOT_IN_HAND'
  | 'MUST_OPEN_WITH_TILE'
  | 'ILLEGAL_MOVE'
  | 'MOVE_AVAILABLE'
  | 'STOCK_EMPTY'
  | 'MUST_DRAW'
  | 'INVALID_STATE';

export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'EngineError';
  }
}

// ---------------------------------------------------------------- tiles

export const tileId = (x: number, y: number): string => `${Math.min(x, y)}-${Math.max(x, y)}`;
export const pips = (tile: Tile): number => tile.a + tile.b;
export const isDouble = (tile: Tile): boolean => tile.a === tile.b;
export const handPips = (hand: readonly Tile[]): number => hand.reduce((sum, t) => sum + pips(t), 0);

/** The 28 double-six tiles in canonical order (a ascending, then b ascending). */
export function createSet(): Tile[] {
  const tiles: Tile[] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) tiles.push({ id: tileId(a, b), a, b });
  return tiles;
}

export const handSize = (playerCount: number): number => (playerCount === 2 ? 7 : 5);

export const isTargetScore = (value: unknown): value is TargetScore =>
  typeof value === 'number' && (TARGET_SCORES as readonly number[]).includes(value);

// ---------------------------------------------------------------- dealing

/**
 * Starting rule (round 1): the holder of the highest double (6-6 down to 0-0)
 * starts and must open with it. With no double dealt, the holder of the
 * heaviest tile (highest pip total, then highest single value) starts with it.
 */
export function findOpening(hands: readonly (readonly Tile[])[]): { seat: number; tileId: string } {
  let best: { seat: number; tile: Tile; rank: number } | null = null;
  hands.forEach((hand, seat) => {
    for (const tile of hand) {
      // doubles always outrank non-doubles; ranks are unique per tile
      const rank = isDouble(tile) ? 1000 + tile.a : pips(tile) * 10 + Math.max(tile.a, tile.b);
      if (!best || rank > best.rank) best = { seat, tile, rank };
    }
  });
  if (!best) throw new EngineError('INVALID_STATE', 'No tiles dealt');
  const found = best as { seat: number; tile: Tile };
  return { seat: found.seat, tileId: found.tile.id };
}

function deal(playerCount: number, random: RandomSource): { hands: Tile[][]; stock: Tile[] } {
  const deck = shuffle(createSet(), random);
  const size = handSize(playerCount);
  const hands: Tile[][] = [];
  for (let seat = 0; seat < playerCount; seat++) hands.push(deck.slice(seat * size, (seat + 1) * size));
  return { hands, stock: deck.slice(playerCount * size) };
}

export function createMatch(playerIds: readonly string[], targetScore: number, random: RandomSource): GameState {
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS)
    throw new EngineError('INVALID_PLAYERS', 'Games require 2 to 4 players');
  if (new Set(playerIds).size !== playerIds.length || playerIds.some((id) => !id))
    throw new EngineError('INVALID_PLAYERS', 'Player ids must be unique and non-empty');
  if (!isTargetScore(targetScore)) throw new EngineError('INVALID_TARGET', 'Invalid target score');
  const { hands, stock } = deal(playerIds.length, random);
  const opening = findOpening(hands);
  const state: GameState = {
    schema: 1,
    version: 0,
    round: 1,
    phase: 'playing',
    targetScore,
    players: playerIds.map((id, seat) => ({ id, score: 0, hand: hands[seat], missing: [] })),
    board: [],
    stock,
    current: opening.seat,
    starter: opening.seat,
    openingTileId: opening.tileId,
    consecutivePasses: 0,
    lastRound: null,
    winnerId: null,
    lastAction: null,
  };
  assertInvariants(state);
  return state;
}

/**
 * Next round: fresh shuffle; the previous round's winner starts and may open
 * with any tile. Scores carry over.
 */
export function startNextRound(previous: GameState, random: RandomSource): GameState {
  if (previous.phase === 'match-over') throw new EngineError('MATCH_OVER');
  if (previous.phase !== 'round-over' || !previous.lastRound) throw new EngineError('ROUND_NOT_OVER');
  const state = cloneState(previous);
  const { hands, stock } = deal(state.players.length, random);
  const starter = state.players.findIndex((p) => p.id === previous.lastRound!.winnerId);
  state.players.forEach((p, seat) => {
    p.hand = hands[seat];
    p.missing = [];
  });
  state.stock = stock;
  state.board = [];
  state.round += 1;
  state.phase = 'playing';
  state.starter = starter < 0 ? 0 : starter;
  state.current = state.starter;
  state.openingTileId = null;
  state.consecutivePasses = 0;
  state.lastAction = null;
  state.version += 1;
  assertInvariants(state);
  return state;
}

// ---------------------------------------------------------------- queries

export interface BoardEnds {
  left: number;
  right: number;
}

export const boardEnds = (board: readonly PlacedTile[]): BoardEnds | null =>
  board.length ? { left: board[0].left, right: board[board.length - 1].right } : null;

/** Ends where `tile` may legally be placed. An empty board uses the canonical 'left'. */
export function legalEndsFor(board: readonly PlacedTile[], openingTileId: string | null, tile: Tile): End[] {
  const ends = boardEnds(board);
  if (!ends) return openingTileId && tile.id !== openingTileId ? [] : ['left'];
  const out: End[] = [];
  if (tile.a === ends.left || tile.b === ends.left) out.push('left');
  if (tile.a === ends.right || tile.b === ends.right) out.push('right');
  return out;
}

export const legalEnds = (state: GameState, tile: Tile): End[] => legalEndsFor(state.board, state.openingTileId, tile);

export interface Move {
  tileId: string;
  end: End;
}

export function legalMoves(state: GameState, seat: number = state.current): Move[] {
  const player = state.players[seat];
  if (!player || state.phase !== 'playing') return [];
  return player.hand.flatMap((tile) => legalEnds(state, tile).map((end) => ({ tileId: tile.id, end })));
}

export const seatOf = (state: GameState, playerId: string): number => state.players.findIndex((p) => p.id === playerId);

// ---------------------------------------------------------------- actions

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/** Orients `tile` so its matching value touches `value` at `end`. */
export function orient(tile: Tile, value: number, end: End): PlacedTile {
  const other = tile.a === value ? tile.b : tile.a;
  return end === 'left'
    ? { id: tile.id, a: tile.a, b: tile.b, left: other, right: value }
    : { id: tile.id, a: tile.a, b: tile.b, left: value, right: other };
}

function addMissing(player: PlayerState, ends: BoardEnds | null): void {
  if (!ends) return;
  for (const v of [ends.left, ends.right]) if (!player.missing.includes(v)) player.missing.push(v);
  player.missing.sort((x, y) => x - y);
}

/**
 * Validates and applies one action. Never mutates `previous`; returns a new
 * state with `version` incremented. Throws EngineError on rejection.
 */
export function applyAction(previous: GameState, action: GameAction): GameState {
  if (!action || typeof action !== 'object' || !['play', 'draw', 'pass'].includes(action.type))
    throw new EngineError('INVALID_ACTION');
  if (previous.phase === 'match-over') throw new EngineError('MATCH_OVER');
  if (previous.phase === 'round-over') throw new EngineError('ROUND_OVER');
  const seat = seatOf(previous, action.playerId);
  if (seat < 0) throw new EngineError('UNKNOWN_PLAYER');
  if (seat !== previous.current) throw new EngineError('NOT_YOUR_TURN');

  const state = cloneState(previous);
  const player = state.players[seat];
  const hasMove = legalMoves(state, seat).length > 0;

  if (action.type === 'play') {
    if (action.end !== 'left' && action.end !== 'right') throw new EngineError('INVALID_ACTION');
    const tile = player.hand.find((t) => t.id === action.tileId);
    if (!tile) throw new EngineError('TILE_NOT_IN_HAND');
    const ends = legalEnds(state, tile);
    if (!ends.includes(action.end)) {
      if (!state.board.length && state.openingTileId && tile.id !== state.openingTileId)
        throw new EngineError('MUST_OPEN_WITH_TILE', state.openingTileId);
      throw new EngineError('ILLEGAL_MOVE');
    }
    player.hand = player.hand.filter((t) => t.id !== tile.id);
    const current = boardEnds(state.board);
    if (!current) state.board.push({ ...tile, left: tile.a, right: tile.b });
    else if (action.end === 'left') state.board.unshift(orient(tile, current.left, 'left'));
    else state.board.push(orient(tile, current.right, 'right'));
    state.openingTileId = null;
    state.consecutivePasses = 0;
    state.lastAction = { type: 'play', playerId: player.id, tileId: tile.id, end: action.end };
    if (!player.hand.length) finishRound(state, seat, 'domino');
    else state.current = (seat + 1) % state.players.length;
  } else if (action.type === 'draw') {
    if (hasMove) throw new EngineError('MOVE_AVAILABLE');
    const tile = state.stock.pop();
    if (!tile) throw new EngineError('STOCK_EMPTY');
    player.hand.push(tile);
    addMissing(player, boardEnds(state.board));
    state.lastAction = { type: 'draw', playerId: player.id };
    // The turn stays with the drawer: draw again or play the drawn tile.
  } else {
    if (hasMove) throw new EngineError('MOVE_AVAILABLE');
    if (state.stock.length) throw new EngineError('MUST_DRAW');
    addMissing(player, boardEnds(state.board));
    state.consecutivePasses += 1;
    state.lastAction = { type: 'pass', playerId: player.id };
    if (state.consecutivePasses >= state.players.length) finishRound(state, blockedWinner(state), 'blocked');
    else state.current = (seat + 1) % state.players.length;
  }
  state.version = previous.version + 1;
  assertInvariants(state);
  return state;
}

/** Blocked round: lowest pip total wins; ties → fewer tiles; ties → lowest seat. */
export function blockedWinner(state: GameState): number {
  let best = 0;
  state.players.forEach((p, seat) => {
    const b = state.players[best];
    const diff = handPips(p.hand) - handPips(b.hand);
    if (diff < 0 || (diff === 0 && p.hand.length < b.hand.length)) best = seat;
  });
  return best;
}

function finishRound(state: GameState, winnerSeat: number, reason: 'domino' | 'blocked'): void {
  const winner = state.players[winnerSeat];
  const points = state.players.reduce((sum, p, seat) => (seat === winnerSeat ? sum : sum + handPips(p.hand)), 0);
  winner.score += points;
  state.lastRound = {
    round: state.round,
    winnerId: winner.id,
    reason,
    points,
    hands: state.players.map((p) => ({ playerId: p.id, pips: handPips(p.hand), tiles: p.hand.map((t) => ({ ...t })) })),
  };
  state.current = winnerSeat;
  if (winner.score >= state.targetScore) {
    state.phase = 'match-over';
    state.winnerId = winner.id;
  } else state.phase = 'round-over';
}

// ---------------------------------------------------------------- integrity

const VALID_IDS = new Set(createSet().map((t) => t.id));

function checkTile(t: unknown): t is Tile {
  if (!t || typeof t !== 'object') return false;
  const tile = t as Tile;
  return (
    Number.isInteger(tile.a) &&
    Number.isInteger(tile.b) &&
    tile.a >= 0 &&
    tile.b <= 6 &&
    tile.a <= tile.b &&
    tile.id === tileId(tile.a, tile.b) &&
    VALID_IDS.has(tile.id)
  );
}

/** Throws INVALID_STATE when any rule-level invariant is broken. */
export function assertInvariants(state: GameState): void {
  const fail = (why: string): never => {
    throw new EngineError('INVALID_STATE', why);
  };
  if (!state || typeof state !== 'object') fail('state missing');
  if (state.schema !== 1) fail('schema');
  if (!isTargetScore(state.targetScore)) fail('target');
  if (!Array.isArray(state.players) || state.players.length < MIN_PLAYERS || state.players.length > MAX_PLAYERS)
    fail('players');
  if (!['playing', 'round-over', 'match-over'].includes(state.phase)) fail('phase');
  if (!Number.isInteger(state.current) || state.current < 0 || state.current >= state.players.length) fail('current');
  if (!Number.isInteger(state.version) || state.version < 0) fail('version');
  if (!Number.isInteger(state.consecutivePasses) || state.consecutivePasses < 0 || state.consecutivePasses > state.players.length)
    fail('passes');
  const seen = new Set<string>();
  const add = (t: unknown) => {
    if (!checkTile(t)) fail('tile shape');
    const tile = t as Tile;
    if (seen.has(tile.id)) fail(`duplicate tile ${tile.id}`);
    seen.add(tile.id);
  };
  const ids = new Set<string>();
  for (const p of state.players) {
    if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id)) fail('player id');
    ids.add(p.id);
    if (!Number.isInteger(p.score) || p.score < 0) fail('score');
    if (!Array.isArray(p.hand) || !Array.isArray(p.missing)) fail('hand');
    p.hand.forEach(add);
  }
  if (!Array.isArray(state.stock) || !Array.isArray(state.board)) fail('piles');
  state.stock.forEach(add);
  state.board.forEach((t, i) => {
    add(t);
    const okOrientation = (t.left === t.a && t.right === t.b) || (t.left === t.b && t.right === t.a);
    if (!okOrientation) fail('orientation');
    if (i > 0 && state.board[i - 1].right !== t.left) fail('chain broken');
  });
  if (seen.size !== TILE_COUNT) fail(`tile count ${seen.size}`);
  if (state.phase === 'match-over' && !state.winnerId) fail('winner');
  if (state.phase === 'playing' && state.players.some((p) => p.hand.length === 0) && state.board.length) fail('empty hand');
}

/** Validates an untrusted value (e.g. a saved game) and returns it typed. */
export function parseState(value: unknown): GameState {
  const state = value as GameState;
  try {
    assertInvariants(state);
  } catch (error) {
    if (error instanceof EngineError) throw error;
    throw new EngineError('INVALID_STATE', 'Malformed state');
  }
  return state;
}
