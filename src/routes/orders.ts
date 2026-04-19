import { Router, Request, Response } from 'express';
import { getPool } from '../lib/postgres';
import { getRedis } from '../lib/redis';
import { Order, OrderItem } from '../types/order';
import logger from '../lib/logger';

const router = Router();
const CACHE_TTL = 60; // seconds

// GET /orders — list all orders
router.get('/', async (_req: Request, res: Response) => {
  try {
    const redis = getRedis();
    const cacheKey = 'orders:all';

    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    }

    const pool = getPool()!;
    const { rows: orders } = await pool.query(
      'SELECT * FROM orders ORDER BY created_at DESC'
    );

    for (const order of orders) {
      const { rows: items } = await pool.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [order.id]
      );
      order.items = items;
    }

    if (redis) {
      await redis.set(cacheKey, JSON.stringify(orders), 'EX', CACHE_TTL);
    }

    res.json(orders);
  } catch (err) {
    logger.error({ err }, 'Failed to list orders');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /orders/:id — get single order
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const redis = getRedis();
    const cacheKey = `orders:${id}`;

    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    }

    const pool = getPool()!;
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = rows[0];
    const { rows: items } = await pool.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [order.id]
    );
    order.items = items;

    if (redis) {
      await redis.set(cacheKey, JSON.stringify(order), 'EX', CACHE_TTL);
    }

    res.json(order);
  } catch (err) {
    logger.error({ err }, 'Failed to get order');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /orders — create order with items
router.post('/', async (req: Request, res: Response) => {
  try {
    const { customerName, customerEmail, items } = req.body as Order;

    if (!customerName || !customerEmail || !items?.length) {
      return res.status(400).json({
        error: 'customerName, customerEmail, and at least one item are required',
      });
    }

    for (const item of items) {
      if (!item.productName || !item.quantity || item.unitPrice == null) {
        return res.status(400).json({
          error: 'Each item requires productName, quantity, and unitPrice',
        });
      }
    }

    const totalAmount = items.reduce(
      (sum: number, item: OrderItem) => sum + item.quantity * item.unitPrice,
      0
    );

    const pool = getPool()!;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO orders (customer_name, customer_email, status, total_amount)
         VALUES ($1, $2, 'pending', $3)
         RETURNING *`,
        [customerName, customerEmail, totalAmount]
      );
      const order = rows[0];

      const orderItems: OrderItem[] = [];
      for (const item of items) {
        const { rows: itemRows } = await client.query(
          `INSERT INTO order_items (order_id, product_name, quantity, unit_price)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [order.id, item.productName, item.quantity, item.unitPrice]
        );
        orderItems.push(itemRows[0]);
      }

      await client.query('COMMIT');

      order.items = orderItems;

      // Invalidate cache
      const redis = getRedis();
      if (redis) {
        await redis.del('orders:all');
      }

      logger.info({ orderId: order.id }, 'Order created');
      res.status(201).json(order);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, 'Failed to create order');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /orders/:id/status — update order status
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const pool = getPool()!;
    const { rows } = await pool.query(
      `UPDATE orders SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Invalidate cache
    const redis = getRedis();
    if (redis) {
      await redis.del('orders:all', `orders:${id}`);
    }

    logger.info({ orderId: id, status }, 'Order status updated');
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'Failed to update order status');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /orders/:id — delete an order
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool()!;

    const { rowCount } = await pool.query('DELETE FROM orders WHERE id = $1', [id]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Invalidate cache
    const redis = getRedis();
    if (redis) {
      await redis.del('orders:all', `orders:${id}`);
    }

    logger.info({ orderId: id }, 'Order deleted');
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, 'Failed to delete order');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
