const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'pos_qris.sqlite');
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// SQLite uses a single connection here, so transactions must be serialized.
// Without this queue, an await inside one transaction lets another request
// interleave its statements into the same transaction.
let transactionQueue = Promise.resolve();

// Enable WAL mode & foreign keys for performance and data integrity
db.run('PRAGMA journal_mode = WAL;');
db.run('PRAGMA foreign_keys = ON;');

// Helper wrappers for async/await
db.getAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

db.allAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

db.runAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

function withTransaction(work) {
  if (typeof work !== 'function') {
    return Promise.reject(new TypeError('withTransaction membutuhkan fungsi callback'));
  }

  const execute = async () => {
    await db.runAsync('BEGIN IMMEDIATE');
    try {
      const result = await work();
      await db.runAsync('COMMIT');
      return result;
    } catch (err) {
      try {
        await db.runAsync('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Transaction rollback error:', rollbackErr.message);
      }
      throw err;
    }
  };

  const result = transactionQueue.then(execute, execute);
  transactionQueue = result.then(() => undefined, () => undefined);
  return result;
}

// Initialize Database Schema
async function ensureColumn(table, column, definition) {
  const columns = await db.allAsync(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await db.runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function initDb() {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS outlets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      address TEXT,
      phone TEXT,
      timezone TEXT DEFAULT 'Asia/Jakarta',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outlet_id INTEGER REFERENCES outlets(id),
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('cashier', 'manager', 'owner')),
      pin_hash TEXT,
      failed_pin_attempts INTEGER DEFAULT 0,
      is_locked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outlet_id INTEGER REFERENCES outlets(id),
      name TEXT NOT NULL,
      color TEXT DEFAULT '#4F46E5',
      icon TEXT DEFAULT 'Package'
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outlet_id INTEGER REFERENCES outlets(id),
      category_id INTEGER REFERENCES categories(id),
      name TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      barcode TEXT,
      unit TEXT DEFAULT 'pcs',
      cost_price INTEGER NOT NULL DEFAULT 0,
      selling_price INTEGER NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 5,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id),
      outlet_id INTEGER REFERENCES outlets(id),
      change_qty INTEGER NOT NULL,
      previous_stock INTEGER NOT NULL,
      current_stock INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('sale', 'return', 'void', 'opname_adjustment', 'stock_in', 'waste')),
      reference_id TEXT,
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outlet_id INTEGER REFERENCES outlets(id),
      user_id INTEGER REFERENCES users(id),
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      starting_cash INTEGER NOT NULL DEFAULT 0,
      cash_in INTEGER NOT NULL DEFAULT 0,
      cash_out INTEGER NOT NULL DEFAULT 0,
      expected_cash INTEGER NOT NULL DEFAULT 0,
      actual_cash INTEGER,
      cash_difference INTEGER DEFAULT 0,
      manager_approved_by INTEGER REFERENCES users(id),
      notes TEXT,
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'closed'))
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS shift_cash_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER REFERENCES shifts(id),
      type TEXT NOT NULL CHECK(type IN ('cash_in', 'cash_out')),
      amount INTEGER NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE,
      email TEXT,
      birthdate TEXT,
      points INTEGER DEFAULT 0,
      membership_tier TEXT DEFAULT 'standard' CHECK(membership_tier IN ('standard', 'silver', 'gold')),
      consent_pdp INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      outlet_id INTEGER REFERENCES outlets(id),
      cashier_id INTEGER REFERENCES users(id),
      customer_id INTEGER REFERENCES customers(id),
      shift_id INTEGER REFERENCES shifts(id),
      status TEXT NOT NULL CHECK(status IN ('pending', 'paid', 'voided', 'refunded', 'held')),
      subtotal INTEGER NOT NULL,
      discount_amount INTEGER DEFAULT 0,
      discount_type TEXT DEFAULT 'nominal',
      tax_rate REAL DEFAULT 0,
      tax_amount INTEGER DEFAULT 0,
      total_amount INTEGER NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'qris', 'card', 'split')),
      held_name TEXT,
      notes TEXT,
      void_reason TEXT,
      void_by INTEGER REFERENCES users(id),
      idempotency_key TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME
    );
  `);

  await ensureColumn('orders', 'idempotency_key', 'TEXT');

  await db.runAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
    ON orders(idempotency_key)
    WHERE idempotency_key IS NOT NULL;
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT REFERENCES orders(id),
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      sku TEXT,
      unit_price INTEGER NOT NULL,
      cost_price INTEGER NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL,
      subtotal INTEGER NOT NULL,
      discount INTEGER DEFAULT 0,
      total INTEGER NOT NULL
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS order_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT REFERENCES orders(id),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'qris', 'card')),
      amount INTEGER NOT NULL,
      tender_amount INTEGER DEFAULT 0,
      change_amount INTEGER DEFAULT 0,
      card_issuer TEXT,
      card_ref TEXT,
      qris_ref TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS order_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id),
      refund_amount INTEGER NOT NULL,
      refund_method TEXT NOT NULL CHECK(refund_method IN ('cash', 'card', 'qris', 'split')),
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'voided')),
      approved_by INTEGER REFERENCES users(id),
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS order_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL REFERENCES order_returns(id),
      order_item_id INTEGER REFERENCES order_items(id),
      product_id INTEGER REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_price INTEGER NOT NULL,
      refund_amount INTEGER NOT NULL
    );
  `);

  await db.runAsync(`
    CREATE INDEX IF NOT EXISTS idx_order_returns_order
    ON order_returns(order_id);
  `);

  await db.runAsync(`
    CREATE INDEX IF NOT EXISTS idx_order_return_items_product
    ON order_return_items(product_id);
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS stock_reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'consumed', 'released')),
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME,
      released_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(order_id, product_id)
    );
  `);

  await db.runAsync(`
    CREATE INDEX IF NOT EXISTS idx_stock_reservations_expiry
    ON stock_reservations(status, expires_at);
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS qris_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT REFERENCES orders(id),
      transaction_ref TEXT UNIQUE NOT NULL,
      issuer_ref TEXT,
      qr_type TEXT DEFAULT 'dynamic' CHECK(qr_type IN ('dynamic', 'static')),
      qr_string TEXT NOT NULL,
      amount INTEGER NOT NULL,
      mdr_percent REAL DEFAULT 0.7,
      mdr_amount INTEGER NOT NULL DEFAULT 0,
      net_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PAID', 'EXPIRED', 'FAILED', 'SETTLED', 'DISPUTED')),
      expires_at DATETIME NOT NULL,
      paid_at DATETIME,
      customer_bank_or_wallet TEXT,
      webhook_payload TEXT,
      settlement_id INTEGER,
      outlet_id INTEGER REFERENCES outlets(id),
      cashier_id INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS settlement_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT UNIQUE NOT NULL,
      settlement_date DATE NOT NULL,
      pjp_name TEXT DEFAULT 'XENDIT_OR_MIDTRANS',
      file_name TEXT,
      total_records INTEGER DEFAULT 0,
      matched_records INTEGER DEFAULT 0,
      mismatch_records INTEGER DEFAULT 0,
      total_gross INTEGER DEFAULT 0,
      total_mdr INTEGER DEFAULT 0,
      total_net INTEGER DEFAULT 0,
      uploaded_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS settlement_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_id INTEGER REFERENCES settlement_batches(id),
      pjp_ref TEXT NOT NULL,
      rrn TEXT,
      amount_gross INTEGER NOT NULL,
      mdr_amount INTEGER NOT NULL,
      amount_net INTEGER NOT NULL,
      paid_time DATETIME,
      match_status TEXT NOT NULL CHECK(match_status IN ('MATCHED', 'AMOUNT_MISMATCH', 'MISSING_IN_POS', 'MISSING_IN_SETTLEMENT')),
      qris_ledger_id INTEGER REFERENCES qris_ledger(id),
      discrepancy_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS reconciliation_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_item_id INTEGER REFERENCES settlement_items(id),
      qris_ledger_id INTEGER REFERENCES qris_ledger(id),
      ticket_number TEXT UNIQUE NOT NULL,
      issue_type TEXT NOT NULL CHECK(issue_type IN ('AMOUNT_MISMATCH', 'MISSING_IN_POS', 'MISSING_IN_SETTLEMENT', 'DUPLICATE_WEBHOOK')),
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'INVESTIGATING', 'RESOLVED')),
      notes TEXT,
      resolution TEXT,
      assigned_to INTEGER REFERENCES users(id),
      resolved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS stock_opnames (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outlet_id INTEGER REFERENCES outlets(id),
      user_id INTEGER REFERENCES users(id),
      manager_id INTEGER REFERENCES users(id),
      opname_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_items_checked INTEGER DEFAULT 0,
      total_discrepancy_qty INTEGER DEFAULT 0,
      total_shrinkage_amount INTEGER DEFAULT 0,
      notes TEXT,
      status TEXT DEFAULT 'completed'
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS stock_opname_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opname_id INTEGER REFERENCES stock_opnames(id),
      product_id INTEGER REFERENCES products(id),
      system_qty INTEGER NOT NULL,
      physical_qty INTEGER NOT NULL,
      discrepancy_qty INTEGER NOT NULL,
      cost_price INTEGER NOT NULL,
      shrinkage_amount INTEGER NOT NULL,
      reason TEXT
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT
    );
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('Database tables initialized successfully.');
}

module.exports = {
  db,
  initDb,
  withTransaction
};
