'use strict';

const fs = require('fs');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const PASSWORD = {
  owner: 'owner123',
  manager: 'manager123',
  cashier: 'kasir123'
};

const MANAGER_PIN = '654321';

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

async function seedDatabase(db) {
  const outlet = await db.runAsync(
    `INSERT INTO outlets (name, code, address, phone, timezone)
     VALUES (?, ?, ?, ?, ?)`,
    ['Outlet Uji Integrasi', 'TEST-01', 'Jl. Uji No. 1', '0800000000', 'Asia/Jakarta']
  );
  const outletId = outlet.lastID;

  const salt = bcrypt.genSaltSync(4);
  const users = [
    ['owner', 'Owner Uji', 'owner', bcrypt.hashSync(PASSWORD.owner, salt), bcrypt.hashSync('123456', salt)],
    ['manager', 'Manajer Uji', 'manager', bcrypt.hashSync(PASSWORD.manager, salt), bcrypt.hashSync(MANAGER_PIN, salt)],
    ['kasir', 'Kasir Uji', 'cashier', bcrypt.hashSync(PASSWORD.cashier, salt), null]
  ];

  const userIds = {};
  for (const [username, fullName, role, passwordHash, pinHash] of users) {
    const result = await db.runAsync(
      `INSERT INTO users (outlet_id, username, password_hash, full_name, role, pin_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [outletId, username, passwordHash, fullName, role, pinHash]
    );
    userIds[role] = result.lastID;
  }

  const settings = [
    ['store_name', 'Outlet Uji Integrasi'],
    ['store_address', 'Jl. Uji No. 1'],
    ['store_phone', '0800000000'],
    ['tax_rate', '11'],
    ['tax_enabled', 'true'],
    ['mdr_qris_rate', '0.7']
  ];
  for (const [key, value] of settings) {
    await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }

  const category = await db.runAsync(
    `INSERT INTO categories (outlet_id, name, color, icon) VALUES (?, ?, ?, ?)`,
    [outletId, 'Kategori Uji', '#4F46E5', 'Package']
  );

  const productRows = [
    ['Produk Uji A', 'TEST-001', '899999000001', 'pcs', 6000, 10000, 100],
    ['Produk Uji B', 'TEST-002', '899999000002', 'pcs', 3000, 5000, 100],
    ['Produk Uji C', 'TEST-003', '899999000003', 'pcs', 2000, 4000, 100]
  ];

  const products = {};
  for (const [name, sku, barcode, unit, costPrice, sellingPrice, stock] of productRows) {
    const result = await db.runAsync(
      `INSERT INTO products
         (outlet_id, category_id, name, sku, barcode, unit, cost_price, selling_price, stock, min_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 5)`,
      [outletId, category.lastID, name, sku, barcode, unit, costPrice, sellingPrice, stock]
    );
    products[sku] = { id: result.lastID, name, selling_price: sellingPrice };
  }

  const shift = await db.runAsync(
    `INSERT INTO shifts (outlet_id, user_id, starting_cash, expected_cash, status)
     VALUES (?, ?, 100000, 100000, 'open')`,
    [outletId, userIds.cashier]
  );

  return {
    outletId,
    userIds,
    shiftId: shift.lastID,
    products,
    categoryId: category.lastID
  };
}

async function login(app, username, password) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ username, password });

  if (response.status !== 200) {
    throw new Error(`Login ${username} gagal: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body.token;
}

async function loginAll(app) {
  return {
    owner: await login(app, 'owner', PASSWORD.owner),
    manager: await login(app, 'manager', PASSWORD.manager),
    cashier: await login(app, 'kasir', PASSWORD.cashier)
  };
}

async function resetTransactionalData(db) {
  await db.runAsync('DELETE FROM order_return_items');
  await db.runAsync('DELETE FROM order_returns');
  await db.runAsync('DELETE FROM stock_reservations');
  await db.runAsync('DELETE FROM order_payments');
  await db.runAsync('DELETE FROM qris_ledger');
  await db.runAsync('DELETE FROM order_items');
  await db.runAsync('DELETE FROM orders');
  await db.runAsync('DELETE FROM stock_movements');
  await db.runAsync('DELETE FROM audit_logs');
  await db.runAsync('UPDATE products SET stock = 100, is_active = 1');
}

async function getStock(db, productId) {
  const row = await db.getAsync('SELECT stock FROM products WHERE id = ?', [productId]);
  return row ? row.stock : null;
}

async function closeDatabase(db, dbPath) {
  await new Promise((resolve) => db.close(resolve));
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${dbPath}${suffix}`);
    } catch (_error) {
      // Already removed or never created.
    }
  }
}

module.exports = {
  PASSWORD,
  MANAGER_PIN,
  authHeader,
  seedDatabase,
  login,
  loginAll,
  resetTransactionalData,
  getStock,
  closeDatabase
};
