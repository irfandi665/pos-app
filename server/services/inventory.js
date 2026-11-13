'use strict';

const MOVEMENT_TYPES = new Set([
  'sale',
  'return',
  'void',
  'opname_adjustment',
  'stock_in',
  'waste'
]);

class InventoryError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = 'InventoryError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

class ProductNotFoundError extends InventoryError {
  constructor(productId) {
    super(`Produk ID ${productId} tidak ditemukan atau sudah dinonaktifkan`, 'PRODUCT_NOT_FOUND', 400);
    this.name = 'ProductNotFoundError';
  }
}

class InsufficientStockError extends InventoryError {
  constructor(productName, availableStock, requestedQuantity) {
    super(
      `Stok barang "${productName}" tidak mencukupi (Tersedia: ${availableStock}, Diminta: ${requestedQuantity})`,
      'INSUFFICIENT_STOCK',
      400
    );
    this.name = 'InsufficientStockError';
    this.available_stock = availableStock;
    this.requested_quantity = requestedQuantity;
  }
}

function parsePositiveInteger(value, fieldName) {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(parsed) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new InventoryError(`${fieldName} harus berupa bilangan bulat positif`, 'INVALID_QUANTITY', 400);
  }
  return parsed;
}

function parseProductId(value) {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(parsed) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new InventoryError('ID produk tidak valid', 'INVALID_PRODUCT_ID', 400);
  }
  return parsed;
}

async function insertMovement(db, {
  productId,
  outletId,
  changeQty,
  previousStock,
  currentStock,
  movementType,
  referenceId,
  notes,
  userId
}) {
  if (!MOVEMENT_TYPES.has(movementType)) {
    throw new InventoryError(
      `Tipe mutasi stok "${movementType}" tidak dikenal`,
      'INVALID_MOVEMENT_TYPE',
      500
    );
  }

  await db.runAsync(
    `INSERT INTO stock_movements
       (product_id, outlet_id, change_qty, previous_stock, current_stock, movement_type, reference_id, notes, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      productId,
      outletId || null,
      changeQty,
      previousStock,
      currentStock,
      movementType,
      referenceId || null,
      notes || null,
      userId || null
    ]
  );
}

/**
 * Atomically deducts stock using a conditional UPDATE. The check and decrement
 * happen in one SQL statement, preventing overselling under concurrent checkouts.
 */
async function deductStock(db, {
  productId,
  quantity,
  outletId = null,
  userId = null,
  referenceId = null,
  notes = 'Penjualan kasir POS',
  movementType = 'sale'
}) {
  const id = parseProductId(productId);
  const qty = parsePositiveInteger(quantity, 'Jumlah pengurangan stok');

  const updated = await db.getAsync(
    `UPDATE products
     SET stock = stock - ?
     WHERE id = ? AND is_active = 1 AND stock >= ?
     RETURNING stock`,
    [qty, id, qty]
  );

  if (!updated) {
    const product = await db.getAsync(
      'SELECT name, stock, is_active FROM products WHERE id = ?',
      [id]
    );

    if (!product || product.is_active !== 1) {
      throw new ProductNotFoundError(id);
    }

    throw new InsufficientStockError(product.name, product.stock, qty);
  }

  const currentStock = updated.stock;
  const previousStock = currentStock + qty;

  await insertMovement(db, {
    productId: id,
    outletId,
    changeQty: -qty,
    previousStock,
    currentStock,
    movementType,
    referenceId,
    notes,
    userId
  });

  return {
    product_id: id,
    quantity: qty,
    previous_stock: previousStock,
    current_stock: currentStock
  };
}

/**
 * Atomically restores stock (void/return) and records the movement.
 */
async function restoreStock(db, {
  productId,
  quantity,
  outletId = null,
  userId = null,
  referenceId = null,
  notes = 'Pengembalian stok',
  movementType = 'return'
}) {
  const id = parseProductId(productId);
  const qty = parsePositiveInteger(quantity, 'Jumlah pengembalian stok');

  const updated = await db.getAsync(
    `UPDATE products
     SET stock = stock + ?
     WHERE id = ?
     RETURNING stock`,
    [qty, id]
  );

  if (!updated) {
    throw new ProductNotFoundError(id);
  }

  const currentStock = updated.stock;
  const previousStock = currentStock - qty;

  await insertMovement(db, {
    productId: id,
    outletId,
    changeQty: qty,
    previousStock,
    currentStock,
    movementType,
    referenceId,
    notes,
    userId
  });

  return {
    product_id: id,
    quantity: qty,
    previous_stock: previousStock,
    current_stock: currentStock
  };
}

module.exports = {
  InventoryError,
  ProductNotFoundError,
  InsufficientStockError,
  deductStock,
  restoreStock
};
