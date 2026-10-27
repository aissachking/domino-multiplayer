import { createHash, timingSafeEqual } from 'node:crypto';
import { PLAYER_ID_RE, TOKEN_RE } from '@daeef/shared';

/**
 * Guest identity: the app generates a random playerId and a secret token and
 * keeps both on the device. The first connection binds the token (hashed) to
 * the id; later connections must present the same token, so knowing someone's
 * public playerId is not enough to take over their seat.
 */
export class SessionRegistry {
  private readonly tokens = new Map<string, { hash: Buffer; lastSeen: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = 7 * 24 * 3600_000,
  ) {}

  authenticate(playerId: unknown, token: unknown): string | null {
    if (typeof playerId !== 'string' || typeof token !== 'string') return null;
    if (!PLAYER_ID_RE.test(playerId) || !TOKEN_RE.test(token) || playerId.startsWith('bot-')) return null;
    const hash = createHash('sha256').update(token).digest();
    const known = this.tokens.get(playerId);
    if (!known) {
      this.tokens.set(playerId, { hash, lastSeen: this.now() });
      return playerId;
    }
    if (!timingSafeEqual(known.hash, hash)) return null;
    known.lastSeen = this.now();
    return playerId;
  }

  prune(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, entry] of this.tokens) if (entry.lastSeen < cutoff) this.tokens.delete(id);
  }
}

/** Token bucket rate limiter, one bucket per key (socket). */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  constructor(
    private readonly capacity = 20,
    private readonly refillPerSecond = 10,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): boolean {
    const t = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, at: t };
    bucket.tokens = Math.min(this.capacity, bucket.tokens + ((t - bucket.at) / 1000) * this.refillPerSecond);
    bucket.at = t;
    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }

  forget(key: string): void {
    this.buckets.delete(key);
  }
}
