'use strict';

const sqlite3 = require('sqlite3').verbose();
const {
  InsufficientStockError,
  ProductNotFoundError,
  deductStock,
  restoreStock
} = require('../../server/services/inventory');

function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const raw = new sqlite3.Database(':memory:');

    const db = {
      runAsync(sql, params = []) {
        return new Promise((res, rej) => {
          raw.run(sql, params, function onRun(err) {
            if (err) rej(err);
            else res({ lastID: this.lastID, changes: this.changes });
          });
        });
      },
      getAsync(sql, params = []) {
        return new Promise((res, rej) => {
          raw.get(sql, params, (err, row) => {
            if (err) rej(err);
            else res(row);
          });
        });
      },
      allAsync(sql, params = []) {
        return new Promise((res, rej) => {
          raw.all(sql, params, (err, rows) => {
            if (err) rej(err);
            else res(rows || []);
          });
        });
      },
      close() {
        return new Promise((res, rej) => {
          raw.close((err) => (err ? rej(err) : res()));
        });
      }
    };

    raw.exec(
      `
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER DEFAULT 1
      );
      CREATE TABLE stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        outlet_id INTEGER,
        change_qty INTEGER NOT NULL,
        previous_stock INTEGER NOT NULL,
        current_stock INTEGER NOT NULL,
        movement_type TEXT NOT NULL,
        reference_id TEXT,
        notes TEXT,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      `,
      (err) => {
        if (err) reject(err);
        else resolve(db);
      }
    );
  });
}

async function getStock(db, productId = 1) {
  const row = await db.getAsync('SELECT stock FROM products WHERE id = ?', [productId]);
  return row.stock;
}

describe('Inventory tracking', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDatabase();
    await db.runAsync(
      'INSERT INTO products (name, stock, is_active) VALUES (?, ?, 1)',
      ['Kopi Arabika', 10]
    );
  });

  afterEach(async () => {
    await db.close();
  });

  test('mengurangi stok secara atomik dan mencatat mutasi', async () => {
    const result = await deductStock(db, {
      productId: 1,
      quantity: 3,
      outletId: 1,
      userId: 1,
      referenceId: 'ORD-TEST-1'
    });

    expect(result.previous_stock).toBe(10);
    expect(result.current_stock).toBe(7);
    expect(await getStock(db)).toBe(7);

    const movements = await db.allAsync('SELECT * FROM stock_movements');
    expect(movements).toHaveLength(1);
    expect(movements[0]).toEqual(expect.objectContaining({
      product_id: 1,
      change_qty: -3,
      previous_stock: 10,
      current_stock: 7,
      movement_type: 'sale',
      reference_id: 'ORD-TEST-1'
    }));
  });

  test('mencegah stok minus saat stok tidak mencukupi', async () => {
    await expect(deductStock(db, { productId: 1, quantity: 11 }))
      .rejects.toBeInstanceOf(InsufficientStockError);

    expect(await getStock(db)).toBe(10);
    const movements = await db.allAsync('SELECT * FROM stock_movements');
    expect(movements).toHaveLength(0);
  });

  test('menolak jumlah stok desimal dan nol tanpa mengubah data', async () => {
    await expect(deductStock(db, { productId: 1, quantity: 1.5 }))
      .rejects.toMatchObject({ code: 'INVALID_QUANTITY' });
    await expect(deductStock(db, { productId: 1, quantity: 0 }))
      .rejects.toMatchObject({ code: 'INVALID_QUANTITY' });

    expect(await getStock(db)).toBe(10);
    expect(await db.allAsync('SELECT * FROM stock_movements')).toHaveLength(0);
  });

  test('menolak produk yang tidak aktif atau tidak ditemukan', async () => {
    await db.runAsync('UPDATE products SET is_active = 0 WHERE id = 1');

    await expect(deductStock(db, { productId: 1, quantity: 1 }))
      .rejects.toBeInstanceOf(ProductNotFoundError);

    expect(await getStock(db)).toBe(10);
  });

  test('hanya satu pengurangan yang berhasil saat dua permintaan bersamaan', async () => {
    const results = await Promise.allSettled([
      deductStock(db, { productId: 1, quantity: 6 }),
      deductStock(db, { productId: 1, quantity: 6 })
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(InsufficientStockError);
    expect(await getStock(db)).toBe(4);

    const movements = await db.allAsync('SELECT * FROM stock_movements');
    expect(movements).toHaveLength(1);
    expect(movements[0].change_qty).toBe(-6);
  });

  test('mengembalikan stok saat retur/void dan mencatat mutasi', async () => {
    await deductStock(db, {
      productId: 1,
      quantity: 3,
      referenceId: 'ORD-TEST-2'
    });

    const result = await restoreStock(db, {
      productId: 1,
      quantity: 2,
      referenceId: 'ORD-TEST-2',
      movementType: 'return',
      notes: 'Retur pelanggan'
    });

    expect(result.previous_stock).toBe(7);
    expect(result.current_stock).toBe(9);
    expect(await getStock(db)).toBe(9);

    const movement = await db.getAsync(
      "SELECT * FROM stock_movements WHERE movement_type = 'return'"
    );
    expect(movement).toEqual(expect.objectContaining({
      change_qty: 2,
      previous_stock: 7,
      current_stock: 9,
      reference_id: 'ORD-TEST-2'
    }));
  });

  test('menolak pengembalian stok untuk produk yang tidak ada', async () => {
    await expect(restoreStock(db, { productId: 999, quantity: 1 }))
      .rejects.toBeInstanceOf(ProductNotFoundError);
  });
});
