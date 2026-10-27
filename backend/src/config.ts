export interface AppConfig {
  port: number;
  host: string;
  corsOrigins: string[] | true;
  databaseUrl?: string;
  databaseSsl: boolean;
  abandonMs: number;
  botDelayMs: number;
  roundBreakMs: number;
  production: boolean;
}

const int = (value: string | undefined, fallback: number, min = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const origins = (env.CORS_ORIGIN ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return {
    port: int(env.PORT, 3000, 0),
    host: env.HOST || '0.0.0.0',
    corsOrigins: origins.length ? origins : true,
    databaseUrl: env.DATABASE_URL || undefined,
    databaseSsl: env.DATABASE_SSL !== 'false',
    abandonMs: int(env.ABANDON_TIMEOUT_MS, 60_000, 1_000),
    botDelayMs: int(env.BOT_DELAY_MS, 900, 0),
    roundBreakMs: int(env.ROUND_BREAK_MS, 12_000, 0),
    production: env.NODE_ENV === 'production',
  };
}
