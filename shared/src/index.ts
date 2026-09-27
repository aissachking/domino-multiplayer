export type PlayerKind = 'human' | 'bot';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';
export type GamePhase = 'lobby' | 'playing' | 'round-over' | 'game-over';
export interface PublicPlayer { id: string; name: string; kind: PlayerKind; connected: boolean; score: number; tileCount: number; }
export interface RoomSummary { code: string; hostId: string; phase: GamePhase; targetScore: number; players: PublicPlayer[]; }
export interface ClientEvents { createRoom: { name: string; targetScore: number }; joinRoom: { code: string; name: string }; addBot: { difficulty: Difficulty }; removeBot: { playerId: string }; startGame: {}; playTile: { tileId: string; end: 'left' | 'right' }; draw: {}; pass: {}; }
export interface ServerError { code: string; message: string; }
