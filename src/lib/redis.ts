import Redis from 'ioredis';
import logger from './logger';

let redis: Redis | null = null;

export async function connectRedis(): Promise<void> {
  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number {
      return Math.min(times * 200, 2000);
    },
  });

  return new Promise<void>((resolve, reject) => {
    redis!.on('connect', () => {
      logger.info('Redis connected');
      resolve();
    });
    redis!.on('error', (err: Error) => {
      logger.error({ err }, 'Redis connection error');
      reject(err);
    });
  });
}

export function getRedis(): Redis | null {
  return redis;
}
