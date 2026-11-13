'use strict';

const os = require('os');
const path = require('path');
const request = require('supertest');

const dbPath = path.join(
  os.tmpdir(),
  `pos-checkout-${process.pid}-${Date.now()}.sqlite`
);
process.env.DATABASE_PATH = dbPath;
process.env.JWT_SECRET = 'integration-checkout-secret';
process.env.PJP_WEBHOOK_SECRET = 'integration-webhook-secret';
process.env.NODE_ENV = 'test';

const { initDb, db } = require('../../server/db');
const { createApp } = require('../../server/app');
const {
  authHeader,
  seedDatabase,
  loginAll,
  resetTransactionalData,
  getStock,
  closeDatabase
} = require('./helpers');

let app;
let tokens;
let fixture;

function checkoutPayload(overrides = {}) {
  return {
    items: [
      { product_id: fixture.products['TEST-001'].id, quantity: 2 },
      { product_id: fixture.products['TEST-002'].id, quantity: 1 }
    ],
    payment_method: 'cash',
    payments: [{ method: 'cash', amount: 26640, tender: 30000 }],
    discount_type: 'nominal',
    discount_value: 1000,
    tax_rate: 11,
    ...overrides
  };
}

function createCashierRequest() {
  return request(app).post('/api/orders').set(authHeader(tokens.cashier));
}

beforeAll(async () => {
  await initDb();
  fixture = await seedDatabase(db);
  app = createApp();
  tokens = await loginAll(app);
});

afterAll(async () => {
  await closeDatabase(db, dbPath);
});

beforeEach(async () => {
  await resetTransactionalData(db);
  await db.runAsync('UPDATE shifts SET status = \'open\' WHERE id = ?', [fixture.shiftId]);
});

describe('POST /api/orders - schema and totals', () => {
  test('mengembalikan JSON schema checkout yang konsisten dan rincian struk', async () => {
    const response = await createCashierRequest()
      .set('X-Idempotency-Key', 'checkout-schema-0001')
      .send(checkoutPayload());

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      idempotent: false
    }));
    expect(typeof response.body.order_id).toBe('string');
    expect(response.body.order_id).toMatch(/^ORD-\d{8}-\d{6}$/);
    expect(response.body.subtotal).toBe(25000);
    expect(response.body.discount_amount).toBe(1000);
    expect(response.body.tax_amount).toBe(2640);
    expect(response.body.total_amount).toBe(26640);
    expect(Number.isSafeInteger(response.body.total_amount)).toBe(true);
    expect(typeof response.body.message).toBe('string');

    const detail = await request(app)
      .get(`/api/orders/${response.body.order_id}`)
      .set(authHeader(tokens.cashier));

    expect(detail.status).toBe(200);
    expect(detail.body.order).toEqual(expect.objectContaining({
      id: response.body.order_id,
      status: 'paid',
      subtotal: 25000,
      discount_amount: 1000,
      tax_amount: 2640,
      total_amount: 26640,
      payment_method: 'cash'
    }));
    expect(detail.body.items).toHaveLength(2);
    expect(detail.body.payments).toHaveLength(1);
    expect(detail.body.payments[0]).toEqual(expect.objectContaining({
      payment_method: 'cash',
      amount: 26640,
      tender_amount: 30000,
      change_amount: 3360
    }));
    expect(detail.body.order.idempotency_key).toBe('checkout-schema-0001');
  });

  test('menolak total pembayaran yang tidak sama dengan tagihan tanpa membuat order', async () => {
    const response = await createCashierRequest()
      .set('X-Idempotency-Key', 'checkout-underpay-0001')
      .send(checkoutPayload({
        payments: [{ method: 'cash', amount: 25000, tender: 25000 }]
      }));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('PAYMENT_TOTAL_MISMATCH');

    const count = await db.getAsync('SELECT COUNT(*) AS total FROM orders');
    expect(count.total).toBe(0);
    expect(await getStock(db, fixture.products['TEST-001'].id)).toBe(100);
  });

  test('menolak item dengan kuantitas desimal sebelum menyentuh database', async () => {
    const response = await createCashierRequest()
      .send(checkoutPayload({
        items: [{ product_id: fixture.products['TEST-001'].id, quantity: 1.5 }]
      }));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_INTEGER');

    const count = await db.getAsync('SELECT COUNT(*) AS total FROM orders');
    expect(count.total).toBe(0);
  });

  test('menolak idempotency key dengan format tidak valid', async () => {
    const response = await createCashierRequest()
      .set('X-Idempotency-Key', 'bad key')
      .send(checkoutPayload());

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_IDEMPOTENCY_KEY');
  });
});

describe('POST /api/orders - idempotency', () => {
  test('replay idempotency key mengembalikan order yang sama dan stok hanya berkurang sekali', async () => {
    const payload = checkoutPayload();
    const key = 'checkout-idem-sequential-0001';

    const first = await createCashierRequest()
      .set('X-Idempotency-Key', key)
      .send(payload);
    const second = await createCashierRequest()
      .set('X-Idempotency-Key', key)
      .send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.order_id).toBe(first.body.order_id);
    expect(second.body.idempotent).toBe(true);
    expect(second.body.total_amount).toBe(first.body.total_amount);

    const orderCount = await db.getAsync('SELECT COUNT(*) AS total FROM orders');
    expect(orderCount.total).toBe(1);
    expect(await getStock(db, fixture.products['TEST-001'].id)).toBe(98);
    expect(await getStock(db, fixture.products['TEST-002'].id)).toBe(99);

    const movements = await db.allAsync(
      "SELECT * FROM stock_movements WHERE movement_type = 'sale' AND reference_id = ?",
      [first.body.order_id]
    );
    expect(movements).toHaveLength(2);
  });

  test('dua request bersamaan dengan key yang sama tetap menghasilkan satu order', async () => {
    const payload = checkoutPayload();
    const key = 'checkout-idem-concurrent-0001';

    const [first, second] = await Promise.all([
      createCashierRequest().set('X-Idempotency-Key', key).send(payload),
      createCashierRequest().set('X-Idempotency-Key', key).send(payload)
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(first.body.order_id).toBe(second.body.order_id);
    expect([first.body.idempotent, second.body.idempotent].filter(Boolean)).toHaveLength(1);

    const orderCount = await db.getAsync('SELECT COUNT(*) AS total FROM orders');
    expect(orderCount.total).toBe(1);
    expect(await getStock(db, fixture.products['TEST-001'].id)).toBe(98);
  });
});

describe('POST /api/orders - concurrency', () => {
  test('hanya satu checkout yang berhasil saat stok tinggal satu', async () => {
    const product = fixture.products['TEST-003'];
    await db.runAsync('UPDATE products SET stock = 1 WHERE id = ?', [product.id]);

    const payload = {
      items: [{ product_id: product.id, quantity: 1 }],
      payment_method: 'cash',
      payments: [{ method: 'cash', amount: 4000, tender: 4000 }],
      tax_rate: 0
    };

    const [first, second] = await Promise.all([
      createCashierRequest().set('X-Idempotency-Key', 'checkout-race-0001').send(payload),
      createCashierRequest().set('X-Idempotency-Key', 'checkout-race-0002').send(payload)
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 400]);

    const rejected = [first, second].find((response) => response.status === 400);
    expect(rejected.body.code).toBe('INSUFFICIENT_STOCK');

    const orderCount = await db.getAsync('SELECT COUNT(*) AS total FROM orders');
    expect(orderCount.total).toBe(1);
    expect(await getStock(db, product.id)).toBe(0);

    const movements = await db.allAsync(
      "SELECT * FROM stock_movements WHERE product_id = ? AND movement_type = 'sale'",
      [product.id]
    );
    expect(movements).toHaveLength(1);
    expect(movements[0].change_qty).toBe(-1);
  });
});

describe('POST /api/orders - transaction rollback', () => {
  test('kegagalan di tengah transaksi membatalkan order, item, stok, dan mutasi', async () => {
    const productA = fixture.products['TEST-001'];
    const productB = fixture.products['TEST-002'];

    await db.runAsync(`
      CREATE TRIGGER fail_product_b
      BEFORE INSERT ON order_items
      WHEN NEW.product_id = ${productB.id}
      BEGIN
        SELECT RAISE(ABORT, 'forced rollback');
      END;
    `);

    try {
      const response = await createCashierRequest()
        .set('X-Idempotency-Key', 'checkout-rollback-0001')
        .send({
          items: [
            { product_id: productA.id, quantity: 1 },
            { product_id: productB.id, quantity: 1 }
          ],
          payment_method: 'cash',
          payments: [{ method: 'cash', amount: 15000, tender: 15000 }],
          tax_rate: 0
        });

      expect(response.status).toBe(500);

      const orders = await db.getAsync('SELECT COUNT(*) AS total FROM orders');
      const items = await db.getAsync('SELECT COUNT(*) AS total FROM order_items');
      const movements = await db.getAsync('SELECT COUNT(*) AS total FROM stock_movements');
      const payments = await db.getAsync('SELECT COUNT(*) AS total FROM order_payments');

      expect(orders.total).toBe(0);
      expect(items.total).toBe(0);
      expect(movements.total).toBe(0);
      expect(payments.total).toBe(0);
      expect(await getStock(db, productA.id)).toBe(100);
      expect(await getStock(db, productB.id)).toBe(100);
    } finally {
      await db.runAsync('DROP TRIGGER IF EXISTS fail_product_b');
    }
  });
});

describe('Authentication', () => {
  test('menolak checkout tanpa token dengan 401', async () => {
    const response = await request(app)
      .post('/api/orders')
      .send(checkoutPayload());

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/token tidak ditemukan/i);
  });

  test('menolak token dengan signature salah dengan 403', async () => {
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer invalid.token.value')
      .send(checkoutPayload());

    expect(response.status).toBe(403);
  });
});
