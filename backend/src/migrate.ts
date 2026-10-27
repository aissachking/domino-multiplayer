import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadConfig } from './config.js';

/** Applies database/migrations/*.sql in name order, each exactly once, in a transaction. */
export async function migrate(connectionString: string, ssl: boolean, dir = fileURLToPath(new URL('../../database/migrations/', import.meta.url))): Promise<string[]> {
  const client = new pg.Client({ connectionString, ssl: ssl ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r: { name: string }) => r.name));
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(`${dir}${file}`, 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = loadConfig();
  if (!config.databaseUrl) {
    console.error('DATABASE_URL is not set; nothing to migrate.');
    process.exit(1);
  }
  migrate(config.databaseUrl, config.databaseSsl)
    .then((applied) => console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.'))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
