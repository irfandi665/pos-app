'use strict';

const { deductStock, restoreStock } = require('./inventory');

/**
 * Reserves stock for a pending QRIS order by deducting it immediately with a
 * movement row. The reservation row is the link that lets settlement consume
 * the stock without deducting it a second time.
 */
async function reserveStockForOrder(db, {
  orderId,
  items,
  outletId = null,
  userId = null,
  expiresAt,
  notes = 'Reservasi stok QRIS dinamis'
}) {
  for (const item of items) {
    await deductStock(db, {
      productId: item.product_id,
      quantity: item.quantity,
      outletId,
      userId,
      referenceId: orderId,
      notes,
      movementType: 'sale'
    });

    await db.runAsync(
      `INSERT INTO stock_reservations
         (order_id, product_id, quantity, status, expires_at)
       VALUES (?, ?, ?, 'active', ?)`,
      [orderId, item.product_id, item.quantity, expiresAt]
    );
  }
}

async function getActiveReservations(db, orderId) {
  return db.allAsync(
    `SELECT * FROM stock_reservations
     WHERE order_id = ? AND status = 'active'
     ORDER BY id ASC`,
    [orderId]
  );
}

async function consumeReservations(db, orderId) {
  const result = await db.runAsync(
    `UPDATE stock_reservations
     SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP
     WHERE order_id = ? AND status = 'active'`,
    [orderId]
  );
  return result.changes || 0;
}

/**
 * Releases every active reservation for an order and restores its stock.
 * Must be called inside withTransaction to keep the stock update and the
 * reservation status update atomic.
 */
async function releaseOrderReservations(db, {
  orderId,
  outletId = null,
  userId = null,
  notes = 'Pelepasan reservasi QRIS kedaluwarsa'
}) {
  const reservations = await getActiveReservations(db, orderId);
  for (const reservation of reservations) {
    await restoreStock(db, {
      productId: reservation.product_id,
      quantity: reservation.quantity,
      outletId,
      userId,
      referenceId: orderId,
      notes,
      movementType: 'void'
    });

    await db.runAsync(
      `UPDATE stock_reservations
       SET status = 'released', released_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'active'`,
      [reservation.id]
    );
  }
  return reservations.length;
}

/**
 * Expires pending QRIS ledgers whose time window has elapsed, releases their
 * stock reservations, and marks the related orders as voided.
 *
 * Must be wrapped by the caller in withTransaction so stock restoration and
 * ledger state changes commit together.
 */
async function releaseExpiredReservations(db, {
  now = new Date().toISOString(),
  notes = 'Pelepasan reservasi QRIS kedaluwarsa'
} = {}) {
  const expiredLedgers = await db.allAsync(
    `SELECT * FROM qris_ledger
     WHERE status = 'PENDING' AND expires_at <= ?
     ORDER BY id ASC`,
    [now]
  );

  const expiredOrders = [];

  for (const ledger of expiredLedgers) {
    const claimed = await db.getAsync(
      `UPDATE qris_ledger
       SET status = 'EXPIRED'
       WHERE id = ? AND status = 'PENDING'
       RETURNING id, order_id, transaction_ref`,
      [ledger.id]
    );

    if (!claimed) continue;

    const releasedCount = await releaseOrderReservations(db, {
      orderId: ledger.order_id,
      outletId: ledger.outlet_id,
      userId: ledger.cashier_id,
      notes
    });

    const orderUpdate = await db.runAsync(
      `UPDATE orders
       SET status = 'voided',
           void_reason = 'QRIS kedaluwarsa tanpa pembayaran'
       WHERE id = ? AND status = 'pending'`,
      [ledger.order_id]
    );

    expiredOrders.push({
      order_id: ledger.order_id,
      transaction_ref: ledger.transaction_ref,
      released_reservations: releasedCount,
      order_voided: (orderUpdate.changes || 0) > 0
    });
  }

  return expiredOrders;
}

module.exports = {
  reserveStockForOrder,
  getActiveReservations,
  consumeReservations,
  releaseOrderReservations,
  releaseExpiredReservations
};
