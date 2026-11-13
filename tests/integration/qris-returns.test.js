'use strict';

const os = require('os');
const path = require('path');
const request = require('supertest');

const dbPath = path.join(
  os.tmpdir(),
  `pos-qris-${process.pid}-${Date.now()}.sqlite`
);
process.env.DATABASE_PATH = dbPath;
process.env.JWT_SECRET = 'integration-qris-secret';
process.env.PJP_WEBHOOK_SECRET = 'integration-webhook-secret';
process.env.NODE_ENV = 'test';

const { initDb, db, withTransaction } = require('../../server/db');
const { createApp } = require('../../server/app');
const { releaseExpiredReservations } = require('../../server/services/reservations');
const {
  MANAGER_PIN,
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

function qrisPayload(productId, quantity = 2, extras = {}) {
  return {
    items: [{ product_id: productId, quantity }],
    tax_rate: 0,
    ...extras
  };
}

function checkoutPayload(productId, quantity = 2, extras = {}) {
  return {
    items: [{ product_id: productId, quantity }],
    payment_method: 'cash',
    payments: [{ method: 'cash', amount: 20000, tender: 20000 }],
    tax_rate: 0,
    ...extras
  };
}

function cashier(appRequest) {
  return appRequest.set(authHeader(tokens.cashier));
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
  await db.runAsync('UPDATE users SET failed_pin_attempts = 0, is_locked = 0');
});

describe('QRIS stock reservation', () => {
  test('generate QRIS memotong stok sebagai reservasi dan menyimpan ledger PENDING', async () => {
    const product = fixture.products['TEST-001'];

    const response = await cashier(request(app).post('/api/qris/generate'))
      .send(qrisPayload(product.id, 2));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      amount: 20000,
      expires_in_seconds: 300
    }));
    expect(response.body.order_id).toMatch(/^ORD-\d{8}-\d{6}$/);
    expect(response.body.transaction_ref).toMatch(/^QRIS-PJP-\d{8}-\d{6}$/);
    expect(response.body.qr_string).toMatch(/^000201/);
    expect(response.body.qr_data_url).toMatch(/^data:image\/png;base64,/);
    expect(typeof response.body.expires_at).toBe('string');

    expect(await getStock(db, product.id)).toBe(98);

    const ledger = await db.getAsync(
      'SELECT * FROM qris_ledger WHERE transaction_ref = ?',
      [response.body.transaction_ref]
    );
    expect(ledger).toEqual(expect.objectContaining({
      order_id: response.body.order_id,
      amount: 20000,
      status: 'PENDING'
    }));

    const reservations = await db.allAsync(
      "SELECT * FROM stock_reservations WHERE order_id = ? AND status = 'active'",
      [response.body.order_id]
    );
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toEqual(expect.objectContaining({
      product_id: product.id,
      quantity: 2
    }));

    const order = await db.getAsync('SELECT * FROM orders WHERE id = ?', [response.body.order_id]);
    expect(order.status).toBe('pending');
  });

  test('simulate-pay mengonsumsi reservasi tanpa memotong stok dua kali dan idempoten', async () => {
    const product = fixture.products['TEST-001'];

    const generated = await cashier(request(app).post('/api/qris/generate'))
      .send(qrisPayload(product.id, 2));
    expect(generated.status).toBe(200);
    expect(await getStock(db, product.id)).toBe(98);

    const paid = await request(app)
      .post('/api/qris/simulate-pay')
      .send({ transaction_ref: generated.body.transaction_ref, customer_bank: 'BCA Mobile' });

    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe('PAID');
    expect(await getStock(db, product.id)).toBe(98);

    const order = await db.getAsync('SELECT * FROM orders WHERE id = ?', [generated.body.order_id]);
    expect(order.status).toBe('paid');

    const reservation = await db.getAsync(
      'SELECT * FROM stock_reservations WHERE order_id = ?',
      [generated.body.order_id]
    );
    expect(reservation.status).toBe('consumed');

    const payments = await db.allAsync(
      'SELECT * FROM order_payments WHERE order_id = ?',
      [generated.body.order_id]
    );
    expect(payments).toHaveLength(1);
    expect(payments[0]).toEqual(expect.objectContaining({
      payment_method: 'qris',
      amount: 20000
    }));

    const duplicatePay = await request(app)
      .post('/api/qris/simulate-pay')
      .send({ transaction_ref: generated.body.transaction_ref });
    expect(duplicatePay.status).toBe(200);
    expect(duplicatePay.body.status).toBe('PAID');
    expect(await getStock(db, product.id)).toBe(98);

    const duplicateWebhook = await request(app)
      .post('/api/qris/webhook')
      .send({
        transaction_ref: generated.body.transaction_ref,
        status: 'PAID',
        amount: 20000
      });
    expect(duplicateWebhook.status).toBe(200);
    expect(duplicateWebhook.body.status).toBe('PAID');

    const paymentCount = await db.getAsync(
      'SELECT COUNT(*) AS total FROM order_payments WHERE order_id = ?',
      [generated.body.order_id]
    );
    expect(paymentCount.total).toBe(1);
    expect(await getStock(db, product.id)).toBe(98);
  });

  test('expiry melepas reservasi, mengembalikan stok, dan menolak webhook PAID terlambat', async () => {
    const product = fixture.products['TEST-001'];

    const generated = await cashier(request(app).post('/api/qris/generate'))
      .send(qrisPayload(product.id, 3));
    expect(generated.status).toBe(200);
    expect(await getStock(db, product.id)).toBe(97);

    const past = new Date(Date.now() - 60_000).toISOString();
    await db.runAsync(
      'UPDATE qris_ledger SET expires_at = ? WHERE transaction_ref = ?',
      [past, generated.body.transaction_ref]
    );
    await db.runAsync(
      'UPDATE stock_reservations SET expires_at = ? WHERE order_id = ?',
      [past, generated.body.order_id]
    );

    const expired = await withTransaction(() => releaseExpiredReservations(db));
    expect(expired).toHaveLength(1);
    expect(expired[0].released_reservations).toBe(1);
    expect(expired[0].order_voided).toBe(true);

    expect(await getStock(db, product.id)).toBe(100);

    const ledger = await db.getAsync(
      'SELECT * FROM qris_ledger WHERE transaction_ref = ?',
      [generated.body.transaction_ref]
    );
    expect(ledger.status).toBe('EXPIRED');

    const order = await db.getAsync('SELECT * FROM orders WHERE id = ?', [generated.body.order_id]);
    expect(order.status).toBe('voided');

    const reservation = await db.getAsync(
      'SELECT * FROM stock_reservations WHERE order_id = ?',
      [generated.body.order_id]
    );
    expect(reservation.status).toBe('released');

    const lateWebhook = await request(app)
      .post('/api/qris/webhook')
      .send({
        transaction_ref: generated.body.transaction_ref,
        status: 'PAID',
        amount: 30000
      });
    expect(lateWebhook.status).toBe(409);
    expect(lateWebhook.body.code).toBe('QRIS_NOT_PENDING');
    expect(await getStock(db, product.id)).toBe(100);
  });

  test('dua generate QRIS bersamaan tidak dapat menjual stok yang sama', async () => {
    const product = fixture.products['TEST-003'];
    await db.runAsync('UPDATE products SET stock = 1 WHERE id = ?', [product.id]);

    const [first, second] = await Promise.all([
      cashier(request(app).post('/api/qris/generate')).send(qrisPayload(product.id, 1)),
      cashier(request(app).post('/api/qris/generate')).send(qrisPayload(product.id, 1))
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 400]);

    const rejected = [first, second].find((response) => response.status === 400);
    expect(rejected.body.code).toBe('INSUFFICIENT_STOCK');

    expect(await getStock(db, product.id)).toBe(0);

    const ledgers = await db.getAsync("SELECT COUNT(*) AS total FROM qris_ledger WHERE status = 'PENDING'");
    expect(ledgers.total).toBe(1);

    const orders = await db.getAsync("SELECT COUNT(*) AS total FROM orders WHERE status = 'pending'");
    expect(orders.total).toBe(1);
  });
});

describe('Return and refund ledger', () => {
  async function createPaidOrder(extras = {}) {
    const product = fixture.products['TEST-001'];
    const response = await cashier(request(app).post('/api/orders'))
      .set('X-Idempotency-Key', `return-order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .send(checkoutPayload(product.id, 2, {
        payments: [{ method: 'cash', amount: 21090, tender: 21090 }],
        discount_type: 'nominal',
        discount_value: 1000,
        tax_rate: 11,
        ...extras
      }));

    expect(response.status).toBe(200);
    return { order: response.body, product };
  }

  test('retur sebagian mencatat refund proporsional, mengembalikan stok, dan mencegah over-return', async () => {
    const { order, product } = await createPaidOrder();
    expect(order.total_amount).toBe(21090);
    expect(await getStock(db, product.id)).toBe(98);

    const firstReturn = await cashier(request(app).post(`/api/orders/${order.order_id}/return`))
      .set('x-manager-pin', MANAGER_PIN)
      .send({ product_id: product.id, return_qty: 1, reason: 'Kemasan rusak' });

    expect(firstReturn.status).toBe(200);
    expect(firstReturn.body).toEqual(expect.objectContaining({
      success: true,
      refund_amount: 10545,
      refund_method: 'cash',
      restocked: true,
      already_returned: 1,
      remaining_refundable: 10545
    }));
    expect(await getStock(db, product.id)).toBe(99);

    const ledger = await request(app)
      .get(`/api/orders/${order.order_id}/returns`)
      .set(authHeader(tokens.cashier));
    expect(ledger.status).toBe(200);
    expect(ledger.body.total_refunded).toBe(10545);
    expect(ledger.body.returns).toHaveLength(1);
    expect(ledger.body.returns[0].items[0]).toEqual(expect.objectContaining({
      quantity: 1,
      refund_amount: 10545
    }));

    const secondReturn = await cashier(request(app).post(`/api/orders/${order.order_id}/return`))
      .set('x-manager-pin', MANAGER_PIN)
      .send({ product_id: product.id, return_qty: 1, reason: 'Sisa retur' });

    expect(secondReturn.status).toBe(200);
    expect(secondReturn.body.refund_amount).toBe(10545);
    expect(secondReturn.body.remaining_refundable).toBe(0);
    expect(await getStock(db, product.id)).toBe(100);

    const thirdReturn = await cashier(request(app).post(`/api/orders/${order.order_id}/return`))
      .set('x-manager-pin', MANAGER_PIN)
      .send({ product_id: product.id, return_qty: 1, reason: 'Melebihi pembelian' });

    expect(thirdReturn.status).toBe(400);
    expect(thirdReturn.body.code).toBe('RETURN_QUANTITY_EXCEEDED');
    expect(await getStock(db, product.id)).toBe(100);
  });

  test('retur tanpa restock tetap mengurangi sisa kuantitas yang dapat diretur', async () => {
    const product = fixture.products['TEST-002'];
    const created = await cashier(request(app).post('/api/orders'))
      .set('X-Idempotency-Key', 'return-nostock-0001')
      .send(checkoutPayload(product.id, 1, {
        payments: [{ method: 'cash', amount: 5000, tender: 5000 }]
      }));
    expect(created.status).toBe(200);

    const returned = await cashier(request(app).post(`/api/orders/${created.body.order_id}/return`))
      .set('x-manager-pin', MANAGER_PIN)
      .send({
        product_id: product.id,
        return_qty: 1,
        reason: 'Barang hilang',
        restock: false
      });

    expect(returned.status).toBe(200);
    expect(returned.body.restocked).toBe(false);
    expect(returned.body.refund_amount).toBe(5000);
    expect(await getStock(db, product.id)).toBe(99);

    const duplicate = await cashier(request(app).post(`/api/orders/${created.body.order_id}/return`))
      .set('x-manager-pin', MANAGER_PIN)
      .send({ product_id: product.id, return_qty: 1, reason: 'Duplikat' });

    expect(duplicate.status).toBe(400);
    expect(duplicate.body.code).toBe('RETURN_QUANTITY_EXCEEDED');
  });

  test('otorisasi manajer wajib ada dan PIN salah ditolak', async () => {
    const { order, product } = await createPaidOrder();

    const noPin = await cashier(request(app).post(`/api/orders/${order.order_id}/return`))
      .send({ product_id: product.id, return_qty: 1 });

    expect(noPin.status).toBe(403);
    expect(noPin.body.error).toMatch(/PIN Manajer diperlukan/i);

    const wrongPin = await cashier(request(app).post(`/api/orders/${order.order_id}/return`))
      .set('x-manager-pin', '000000')
      .send({ product_id: product.id, return_qty: 1 });

    expect(wrongPin.status).toBe(401);
    expect(wrongPin.body.error).toMatch(/PIN Manajer salah/i);

    const returns = await db.getAsync(
      'SELECT COUNT(*) AS total FROM order_returns WHERE order_id = ?',
      [order.order_id]
    );
    expect(returns.total).toBe(0);
  });
});
