import request from 'supertest';
import express from 'express';

// Mock postgres and redis before importing routes
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockRelease = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();

jest.mock('../lib/postgres', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: mockConnect,
  }),
}));

jest.mock('../lib/redis', () => ({
  getRedis: () => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  }),
}));

jest.mock('../lib/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  default: { info: jest.fn(), error: jest.fn() },
}));

import ordersRouter from '../routes/orders';

const app = express();
app.use(express.json());
app.use('/orders', ordersRouter);

beforeEach(() => {
  jest.clearAllMocks();
  mockRedisGet.mockResolvedValue(null); // no cache by default
  mockRedisSet.mockResolvedValue('OK');
  mockRedisDel.mockResolvedValue(1);
});

describe('POST /orders', () => {
  it('should return 400 if required fields are missing', async () => {
    const res = await request(app).post('/orders').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/customerName/);
  });

  it('should return 400 if items are invalid', async () => {
    const res = await request(app).post('/orders').send({
      customerName: 'John',
      customerEmail: 'john@test.com',
      items: [{ productName: '' }],
    });
    expect(res.status).toBe(400);
  });

  it('should create an order with items', async () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockConnect.mockResolvedValue(mockClient);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 1, customer_name: 'John', status: 'pending', total_amount: 29.98 }],
      }) // INSERT order
      .mockResolvedValueOnce({
        rows: [{ id: 1, order_id: 1, product_name: 'Widget', quantity: 2, unit_price: 14.99 }],
      }) // INSERT item
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app).post('/orders').send({
      customerName: 'John',
      customerEmail: 'john@test.com',
      items: [{ productName: 'Widget', quantity: 2, unitPrice: 14.99 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(mockClient.query).toHaveBeenCalledTimes(4);
  });
});

describe('GET /orders', () => {
  it('should return cached orders if available', async () => {
    const cached = [{ id: 1, customer_name: 'John', items: [] }];
    mockRedisGet.mockResolvedValue(JSON.stringify(cached));

    const res = await request(app).get('/orders');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(cached);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should query DB and cache if no cache', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, customer_name: 'John' }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, product_name: 'Widget' }] });

    const res = await request(app).get('/orders');
    expect(res.status).toBe(200);
    expect(res.body[0].items).toHaveLength(1);
    expect(mockRedisSet).toHaveBeenCalled();
  });
});

describe('GET /orders/:id', () => {
  it('should return 404 for non-existent order', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/orders/999');
    expect(res.status).toBe(404);
  });

  it('should return an order with items', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, customer_name: 'John' }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, product_name: 'Widget' }] });

    const res = await request(app).get('/orders/1');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });
});

describe('PATCH /orders/:id/status', () => {
  it('should return 400 for invalid status', async () => {
    const res = await request(app)
      .patch('/orders/1/status')
      .send({ status: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('should update order status', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'confirmed' }],
    });

    const res = await request(app)
      .patch('/orders/1/status')
      .send({ status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
  });
});

describe('DELETE /orders/:id', () => {
  it('should return 404 for non-existent order', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(app).delete('/orders/999');
    expect(res.status).toBe(404);
  });

  it('should delete an order', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app).delete('/orders/1');
    expect(res.status).toBe(204);
  });
});
