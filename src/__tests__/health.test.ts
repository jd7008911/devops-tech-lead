import request from 'supertest';
import express from 'express';
import healthRouter from '../routes/health';

const app = express();
app.use('/health', healthRouter);

describe('Health endpoints', () => {
  it('GET /health/live should return 200', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('alive');
  });
});
