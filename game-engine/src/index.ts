export type End = 'left' | 'right';
export interface Tile { id: string; a: number; b: number; }
export interface PlacedTile extends Tile { left: number; right: number; }
export interface EnginePlayer { id: string; score: number; hand: Tile[]; }
export interface GameState { players: EnginePlayer[]; board: PlacedTile[]; stock: Tile[]; current: number; consecutivePasses: number; targetScore: number; roundOver: boolean; winnerId?: string; }

export const createSet = (): Tile[] => {
  const tiles: Tile[] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) tiles.push({ id: `${a}-${b}`, a, b });
  return tiles;
};
export const shuffled = <T>(items: T[], random: () => number = Math.random): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};
export const handSize = (count: number): number => count === 2 ? 7 : 5;
export function createGame(ids: string[], targetScore = 100, random: () => number = Math.random): GameState {
  if (ids.length < 2 || ids.length > 4) throw new Error('Games require 2 to 4 players');
  if (![50, 100, 150, 200].includes(targetScore)) throw new Error('Invalid target score');
  const deck = shuffled(createSet(), random); const size = handSize(ids.length);
  return { players: ids.map(id => ({ id, score: 0, hand: deck.splice(0, size) })), board: [], stock: deck, current: 0, consecutivePasses: 0, targetScore, roundOver: false };
}
export const exposed = (state: GameState) => state.board.length ? { left: state.board[0].left, right: state.board.at(-1)!.right } : undefined;
export const legalEnds = (state: GameState, tile: Tile): End[] => {
  if (!state.board.length) return ['left', 'right']; const ends = exposed(state)!;
  return (['left', 'right'] as End[]).filter(end => tile.a === ends[end] || tile.b === ends[end]);
};
export const legalTiles = (state: GameState, playerIndex = state.current): Tile[] => state.players[playerIndex].hand.filter(tile => legalEnds(state, tile).length > 0);
function withRightMatching(tile: Tile, value: number): PlacedTile { return tile.a === value ? { ...tile, left: tile.b, right: tile.a } : { ...tile, left: tile.a, right: tile.b }; }
export function play(state: GameState, playerId: string, tileId: string, end: End): GameState {
  if (state.roundOver) throw new Error('Round is over'); const player = state.players[state.current];
  if (player.id !== playerId) throw new Error('Not your turn'); const tile = player.hand.find(item => item.id === tileId);
  if (!tile || !legalEnds(state, tile).includes(end)) throw new Error('Illegal tile placement');
  player.hand = player.hand.filter(item => item.id !== tileId);
  if (!state.board.length) state.board.push({ ...tile, left: tile.a, right: tile.b });
  else { const placed = withRightMatching(tile, exposed(state)![end]); if (end === 'left') state.board.unshift(placed); else state.board.push({ ...placed, left: placed.right, right: placed.left }); }
  state.consecutivePasses = 0;
  if (!player.hand.length) finishRound(state, state.current); else state.current = (state.current + 1) % state.players.length;
  return state;
}
export function draw(state: GameState, playerId: string): Tile {
  const player = state.players[state.current]; if (state.roundOver || player.id !== playerId) throw new Error('Not your turn');
  if (legalTiles(state).length) throw new Error('A legal move is available'); const tile = state.stock.pop(); if (!tile) throw new Error('Stock is empty'); player.hand.push(tile); return tile;
}
export function pass(state: GameState, playerId: string): GameState {
  const player = state.players[state.current]; if (state.roundOver || player.id !== playerId) throw new Error('Not your turn');
  if (state.stock.length || legalTiles(state).length) throw new Error('Cannot pass'); state.consecutivePasses++;
  if (state.consecutivePasses >= state.players.length) finishRound(state, lowestHand(state)); else state.current = (state.current + 1) % state.players.length;
  return state;
}
const pipSum = (hand: Tile[]) => hand.reduce((sum, tile) => sum + tile.a + tile.b, 0);
const lowestHand = (state: GameState) => state.players.reduce((best, player, index) => pipSum(player.hand) < pipSum(state.players[best].hand) ? index : best, 0);
function finishRound(state: GameState, winner: number): void { const points = state.players.reduce((sum, player, index) => index === winner ? sum : sum + pipSum(player.hand), 0); state.players[winner].score += points; state.roundOver = true; state.winnerId = state.players[winner].score >= state.targetScore ? state.players[winner].id : undefined; }
