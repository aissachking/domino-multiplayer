import pg from 'pg';
import type { MatchRecord, MatchRepository, PlayerStats } from './repository.js';

/** PostgreSQL implementation (schema: database/migrations). */
export class PostgresMatchRepository implements MatchRepository {
  readonly kind = 'postgres' as const;
  private readonly pool: pg.Pool;

  constructor(connectionString: string, ssl: boolean) {
    this.pool = new pg.Pool({
      connectionString,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });
    this.pool.on('error', (error: Error) => console.error('[db] idle client error:', error.message));
  }

  async saveMatch(match: MatchRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO match_records (id, room_code, target_score, rounds, winner_id, started_at, ended_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [match.id, match.roomCode, match.targetScore, match.rounds, match.winnerId, match.startedAt, match.endedAt],
      );
      if (inserted.rowCount) {
        for (const p of match.participants) {
          if (p.kind === 'human') {
            await client.query(
              `INSERT INTO players (id, display_name) VALUES ($1,$2)
               ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, last_seen_at = now()`,
              [p.playerId, p.name],
            );
          }
          await client.query(
            `INSERT INTO match_participants (match_id, seat, player_id, display_name, kind, difficulty, final_score, won)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [match.id, p.seat, p.playerId, p.name, p.kind, p.difficulty ?? null, p.score, p.won],
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async statsFor(playerId: string): Promise<PlayerStats> {
    const { rows } = await this.pool.query(
      `SELECT count(*)::int AS played, count(*) FILTER (WHERE won)::int AS won,
              coalesce(sum(final_score),0)::int AS total, coalesce(max(final_score),0)::int AS best
         FROM match_participants WHERE player_id = $1`,
      [playerId],
    );
    const r = rows[0] ?? {};
    return { playerId, played: r.played ?? 0, won: r.won ?? 0, totalPoints: r.total ?? 0, bestScore: r.best ?? 0 };
  }

  async recentMatches(playerId: string, limit: number): Promise<MatchRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT m.* FROM match_records m
         JOIN match_participants p ON p.match_id = m.id
        WHERE p.player_id = $1 ORDER BY m.ended_at DESC LIMIT $2`,
      [playerId, Math.min(Math.max(limit, 1), 50)],
    );
    const out: MatchRecord[] = [];
    for (const m of rows) {
      const parts = await this.pool.query(
        'SELECT * FROM match_participants WHERE match_id = $1 ORDER BY seat',
        [m.id],
      );
      out.push({
        id: m.id,
        roomCode: m.room_code,
        targetScore: m.target_score,
        rounds: m.rounds,
        winnerId: m.winner_id,
        startedAt: m.started_at,
        endedAt: m.ended_at,
        participants: parts.rows.map((p) => ({
          seat: p.seat,
          playerId: p.player_id,
          name: p.display_name,
          kind: p.kind,
          difficulty: p.difficulty ?? undefined,
          score: p.final_score,
          won: p.won,
        })),
      });
    }
    return out;
  }

  async healthy(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
