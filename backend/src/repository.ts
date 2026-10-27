import type { Difficulty, PlayerKind } from '@daeef/shared';

export interface MatchParticipant {
  seat: number;
  playerId: string;
  name: string;
  kind: PlayerKind;
  difficulty?: Difficulty;
  score: number;
  won: boolean;
}

export interface MatchRecord {
  id: string;
  roomCode: string;
  targetScore: number;
  rounds: number;
  winnerId: string;
  startedAt: Date;
  endedAt: Date;
  participants: MatchParticipant[];
}

export interface PlayerStats {
  playerId: string;
  played: number;
  won: number;
  totalPoints: number;
  bestScore: number;
}

/** Durable match history. Live game state is never stored here. */
export interface MatchRepository {
  readonly kind: 'memory' | 'postgres';
  saveMatch(match: MatchRecord): Promise<void>;
  statsFor(playerId: string): Promise<PlayerStats>;
  recentMatches(playerId: string, limit: number): Promise<MatchRecord[]>;
  healthy(): Promise<boolean>;
  close(): Promise<void>;
}

export class MemoryMatchRepository implements MatchRepository {
  readonly kind = 'memory' as const;
  private readonly matches: MatchRecord[] = [];
  constructor(private readonly limit = 5000) {}

  async saveMatch(match: MatchRecord): Promise<void> {
    if (this.matches.some((m) => m.id === match.id)) return; // idempotent
    this.matches.push(structuredClone(match));
    if (this.matches.length > this.limit) this.matches.shift();
  }

  async statsFor(playerId: string): Promise<PlayerStats> {
    const stats: PlayerStats = { playerId, played: 0, won: 0, totalPoints: 0, bestScore: 0 };
    for (const m of this.matches) {
      const p = m.participants.find((x) => x.playerId === playerId);
      if (!p) continue;
      stats.played++;
      if (p.won) stats.won++;
      stats.totalPoints += p.score;
      stats.bestScore = Math.max(stats.bestScore, p.score);
    }
    return stats;
  }

  async recentMatches(playerId: string, limit: number): Promise<MatchRecord[]> {
    return this.matches
      .filter((m) => m.participants.some((p) => p.playerId === playerId))
      .slice(-limit)
      .reverse()
      .map((m) => structuredClone(m));
  }

  async healthy(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}
}
