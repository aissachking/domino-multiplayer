import 'dotenv/config';
import { loadConfig } from './config.js';
import { migrate } from './migrate.js';
import { PostgresMatchRepository } from './postgres.js';
import { type MatchRepository, MemoryMatchRepository } from './repository.js';
import { startServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  let repository: MatchRepository = new MemoryMatchRepository();
  if (config.databaseUrl) {
    try {
      if (process.env.RUN_MIGRATIONS === 'true') {
        const applied = await migrate(config.databaseUrl, config.databaseSsl);
        console.log(`[db] migrations applied: ${applied.join(', ') || 'none'}`);
      }
      const pg = new PostgresMatchRepository(config.databaseUrl, config.databaseSsl);
      if (await pg.healthy()) repository = pg;
      else {
        console.error('[db] database unreachable — falling back to in-memory match history');
        await pg.close().catch(() => undefined);
      }
    } catch (error) {
      console.error('[db] setup failed — falling back to in-memory match history:', (error as Error).message);
    }
  } else if (config.production) {
    console.warn('[db] DATABASE_URL not set — match history is kept in memory only');
  }
  if (config.production && config.corsOrigins === true) console.warn('[cors] CORS_ORIGIN not set — all origins allowed');

  const server = await startServer({ config, repository });
  const shutdown = (signal: string) => {
    console.log(`[domino] ${signal} received, shutting down`);
    server.close().finally(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[domino] fatal:', error);
  process.exit(1);
});
