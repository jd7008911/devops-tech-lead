import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import logger from './lib/logger';
import { connectPostgres, getPool } from './lib/postgres';
import { connectRedis, getRedis } from './lib/redis';
import healthRouter from './routes/health';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Security & middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Routes
app.use('/health', healthRouter);

app.get('/', (_req, res) => {
  res.json({ message: 'DevOps Tech Lead API', version: '1.0.0' });
});

// Graceful shutdown
function gracefulShutdown(signal: string): void {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  const pool = getPool();
  const redis = getRedis();

  Promise.all([
    pool ? pool.end() : Promise.resolve(),
    redis ? redis.quit() : Promise.resolve(),
  ])
    .then(() => {
      logger.info('All connections closed. Exiting.');
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
async function start(): Promise<void> {
  try {
    await connectPostgres();
    await connectRedis();

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();

export default app;
