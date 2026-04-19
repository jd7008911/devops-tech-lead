import { Router, Request, Response } from 'express';
import { getPool } from '../lib/postgres';
import { getRedis } from '../lib/redis';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {};

  try {
    const pool = getPool();
    if (pool) {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      checks.postgres = 'ok';
    }
  } catch {
    checks.postgres = 'error';
  }

  try {
    const redis = getRedis();
    if (redis) {
      await redis.ping();
      checks.redis = 'ok';
    }
  } catch {
    checks.redis = 'error';
  }

  const healthy = Object.values(checks).every((v) => v === 'ok');
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    uptime: process.uptime(),
    checks,
  });
});

router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

router.get('/ready', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (pool) {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
    }
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready' });
  }
});

export default router;
