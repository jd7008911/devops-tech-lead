import { Pool, PoolClient } from 'pg';
import logger from './logger';

let pool: Pool | null = null;

export async function connectPostgres(): Promise<void> {
  pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'app',
    user: process.env.PGUSER || 'app',
    password: process.env.PGPASSWORD || 'changeme',
    max: parseInt(process.env.PG_POOL_MAX || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  const client: PoolClient = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  logger.info('PostgreSQL connected');
}

export function getPool(): Pool | null {
  return pool;
}
