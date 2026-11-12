const bcrypt = require('bcryptjs');
const { db, initDb } = require('./db');

async function seed() {
  await initDb();

  console.log('Clearing existing seed data if needed...');
  
  // Check if outlet exists
  const existingOutlet = await db.getAsync('SELECT id FROM outlets WHERE code = ?', ['TBM-01']);
  let outletId = existingOutlet?.id;

  if (!outletId) {
    const res = await db.runAsync(
      `INSERT INTO outlets (name, code, address, phone, timezone) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        'Toko Berkah Mandiri (Outlet Utama)',
        'TBM-01',
        'Jl. Malioboro No. 45, Danurejan, Yogyakarta 55213',
        '0812-3456-7890',
        'Asia/Jakarta'
      ]
    );
    outletId = res.lastID;
    console.log('Created outlet:', outletId);
  }

  // Users
  const userCount = await db.getAsync('SELECT COUNT(*) as cnt FROM users');
  if (userCount.cnt === 0) {
    const salt = bcrypt.genSaltSync(10);
    const passOwner = bcrypt.hashSync('owner123', salt);
    const passManager = bcrypt.hashSync('manager123', salt);
    const passCashier = bcrypt.hashSync('kasir123', salt);

    const pinOwner = bcrypt.hashSync('123456', salt);
    const pinManager = bcrypt.hashSync('654321', salt);

    await db.runAsync(
      `INSERT INTO users (outlet_id, username, password_hash, full_name, role, pin_hash) VALUES 
       (?, 'owner', ?, 'Hendra Wijaya (Owner)', 'owner', ?),
       (?, 'manager', ?, 'Budi Santoso (Manajer Toko)', 'manager', ?),
       (?, 'kasir', ?, 'Siti Rahmawati (Kasir)', 'cashier', NULL)`,
      [
        outletId, passOwner, pinOwner,
        outletId, passManager, pinManager,
        outletId, passCashier
      ]
    );
    console.log('Created default users: owner, manager, kasir');
  }

  // Settings
  const settingsList = [
    ['store_name', 'Toko Berkah Mandiri', 'Nama toko yang tercetak di struk'],
    ['store_address', 'Jl. Malioboro No. 45, Yogyakarta', 'Alamat lengkap toko'],
    ['store_phone', '0812-3456-7890', 'Nomor telepon toko'],
    ['tax_rate', '11', 'Tarif PPN dalam persen'],
    ['tax_enabled', 'true', 'Aktifkan pajak pada kalkulasi POS'],
    ['mdr_qris_rate', '0.7', 'Biaya MDR QRIS resmi Bank Indonesia (0.7%)'],
    ['pjp_provider', 'XENDIT_OR_MIDTRANS', 'Penyelenggara Jasa Pembayaran QRIS'],
    ['pjp_merchant_id', 'MID-ID-QRIS-789123', 'National Merchant ID (NMID)'],
    ['receipt_footer', 'Terima kasih telah berbelanja! Barang yang sudah dibeli tidak dapat ditukar tanpa struk.', 'Catatan kaki struk belanja'],
    ['printer_type', '58mm', 'Ukuran lebar kertas printer struk (58mm atau 80mm)']
  ];

  for (const [k, v, desc] of settingsList) {
    await db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value, description) VALUES (?, ?, ?)`,
      [k, v, desc]
    );
  }

  // Categories
  const catCount = await db.getAsync('SELECT COUNT(*) as cnt FROM categories');
  let beverageId, foodId, groceryId, careId;

  if (catCount.cnt === 0) {
    const c1 = await db.runAsync(`INSERT INTO categories (outlet_id, name, color, icon) VALUES (?, 'Minuman', '#0284C7', 'Coffee')`, [outletId]);
    beverageId = c1.lastID;
    const c2 = await db.runAsync(`INSERT INTO categories (outlet_id, name, color, icon) VALUES (?, 'Makanan & Camilan', '#EA580C', 'Utensils')`, [outletId]);
    foodId = c2.lastID;
    const c3 = await db.runAsync(`INSERT INTO categories (outlet_id, name, color, icon) VALUES (?, 'Kebutuhan Pokok', '#16A34A', 'ShoppingBag')`, [outletId]);
    groceryId = c3.lastID;
    const c4 = await db.runAsync(`INSERT INTO categories (outlet_id, name, color, icon) VALUES (?, 'Perawatan Pribadi', '#9333EA', 'Smile')`, [outletId]);
    careId = c4.lastID;
    console.log('Created default categories');
  } else {
    const cats = await db.allAsync('SELECT id, name FROM categories');
    beverageId = cats.find(c => c.name === 'Minuman')?.id;
    foodId = cats.find(c => c.name === 'Makanan & Camilan')?.id;
    groceryId = cats.find(c => c.name === 'Kebutuhan Pokok')?.id;
    careId = cats.find(c => c.name === 'Perawatan Pribadi')?.id;
  }

  // Products
  const prodCount = await db.getAsync('SELECT COUNT(*) as cnt FROM products');
  if (prodCount.cnt === 0) {
    const sampleProducts = [
      [outletId, beverageId, 'Kopi Susu Gula Aren 250ml', 'KOP-001', '899100100101', 'botol', 8000, 18000, 45, 10, 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=150'],
      [outletId, beverageId, 'Teh Tarik Dingin Cup', 'TEH-001', '899100100102', 'cup', 4000, 10000, 60, 15, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=150'],
      [outletId, beverageId, 'Air Mineral 600ml', 'MIN-001', '899100100103', 'botol', 2200, 4000, 120, 24, 'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=150'],
      [outletId, foodId, 'Indomie Goreng Spesial + Telur', 'IND-001', '899100100201', 'porsi', 6000, 12000, 80, 20, 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=150'],
      [outletId, foodId, 'Roti Bakar Cokelat Keju', 'ROT-001', '899100100202', 'porsi', 8000, 16000, 30, 10, 'https://images.unsplash.com/photo-1584776296944-ab6fb57b0bdd?w=150'],
      [outletId, foodId, 'Snack Chitato Sapi Panggang 68g', 'SNK-001', '899100100203', 'bks', 8500, 12500, 35, 10, 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=150'],
      [outletId, foodId, 'Biskuit Roma Kelapa 300g', 'BSK-001', '899100100204', 'bks', 7500, 11000, 28, 8, 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?w=150'],
      [outletId, groceryId, 'Beras Ramos Super 5kg', 'BRS-001', '899100100301', 'karung', 65000, 75000, 15, 5, 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=150'],
      [outletId, groceryId, 'Minyak Goreng Sawit 2L', 'MYK-001', '899100100302', 'pouch', 28000, 35000, 18, 10, 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=150'],
      [outletId, groceryId, 'Gula Pasir Kristal 1kg', 'GUL-001', '899100100303', 'bks', 14000, 17500, 4, 10, 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?w=150'], // Low stock alert!
      [outletId, careId, 'Sabun Mandi Cair Refill 450ml', 'SBN-001', '899100100401', 'pouch', 19000, 26000, 3, 8, 'https://images.unsplash.com/photo-1608248597359-00624d081f21?w=150'], // Low stock alert!
      [outletId, careId, 'Pasta Gigi Herbal 120g', 'PST-001', '899100100402', 'tube', 9500, 14500, 24, 6, 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=150']
    ];

    for (const p of sampleProducts) {
      const res = await db.runAsync(
        `INSERT INTO products (outlet_id, category_id, name, sku, barcode, unit, cost_price, selling_price, stock, min_stock, image_url) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        p
      );
      // initial stock movement
      await db.runAsync(
        `INSERT INTO stock_movements (product_id, outlet_id, change_qty, previous_stock, current_stock, movement_type, notes) 
         VALUES (?, ?, ?, 0, ?, 'stock_in', 'Inisialisasi stok awal sistem')`,
        [res.lastID, outletId, p[8], p[8]]
      );
    }
    console.log('Created sample products with stock movements');
  }

  // Customers
  const custCount = await db.getAsync('SELECT COUNT(*) as cnt FROM customers');
  if (custCount.cnt === 0) {
    await db.runAsync(
      `INSERT INTO customers (name, phone, email, birthdate, points, membership_tier) VALUES 
       ('Budi Santoso', '081299887766', 'budi.santoso@example.com', '1990-05-14', 450, 'gold'),
       ('Annisa Putri', '081311223344', 'annisa.putri@example.com', '1995-09-20', 210, 'silver'),
       ('Rian Pratama', '085677889900', 'rian.p@example.com', '1998-12-01', 50, 'standard')`
    );
    console.log('Created sample CRM customers');
  }

  // Active cashier shift for testing
  const activeShift = await db.getAsync('SELECT id FROM shifts WHERE status = "open"');
  let shiftId = activeShift?.id;
  if (!shiftId) {
    const cashier = await db.getAsync('SELECT id FROM users WHERE role = "cashier" LIMIT 1');
    const sRes = await db.runAsync(
      `INSERT INTO shifts (outlet_id, user_id, starting_cash, cash_in, cash_out, expected_cash, status) 
       VALUES (?, ?, 200000, 0, 0, 200000, 'open')`,
      [outletId, cashier ? cashier.id : 1]
    );
    shiftId = sRes.lastID;
    console.log('Opened initial active shift ID:', shiftId);
  }

  // Seed QRIS Ledger & Settlement Batch to demonstrate Auto Reconciliation immediately
  const qrisLedgerCount = await db.getAsync('SELECT COUNT(*) as cnt FROM qris_ledger');
  if (qrisLedgerCount.cnt === 0) {
    const cashier = await db.getAsync('SELECT id FROM users WHERE role = "cashier" LIMIT 1');
    const cashierId = cashier ? cashier.id : 1;
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dateStr = yesterday.toISOString().split('T')[0];

    // Create 4 orders from yesterday
    const sampleOrders = [
      { id: 'ORD-20261111-0001', total: 46000, ref: 'QRIS-PJP-20261111-001', rrn: '982736182901', bank: 'BCA Mobile', status: 'SETTLED' },
      { id: 'ORD-20261111-0002', total: 28000, ref: 'QRIS-PJP-20261111-002', rrn: '982736182902', bank: 'GoPay', status: 'SETTLED' },
      { id: 'ORD-20261111-0003', total: 75000, ref: 'QRIS-PJP-20261111-003', rrn: '982736182903', bank: 'Livin Mandiri', status: 'SETTLED' },
      { id: 'ORD-20261111-0004', total: 35000, ref: 'QRIS-PJP-20261111-004', rrn: '982736182904', bank: 'OVO', status: 'PAID' } // Missing in settlement
    ];

    for (const o of sampleOrders) {
      await db.runAsync(
        `INSERT INTO orders (id, outlet_id, cashier_id, shift_id, status, subtotal, discount_amount, tax_rate, tax_amount, total_amount, payment_method, created_at, paid_at) 
         VALUES (?, ?, ?, ?, 'paid', ?, 0, 11, ROUND(? * 0.11), ?, 'qris', ?, ?)`,
        [o.id, outletId, cashierId, shiftId, o.total, o.total, o.total, yesterday.toISOString(), yesterday.toISOString()]
      );

      const mdr = Math.round(o.total * 0.007);
      const net = o.total - mdr;

      await db.runAsync(
        `INSERT INTO qris_ledger (order_id, transaction_ref, issuer_ref, qr_type, qr_string, amount, mdr_percent, mdr_amount, net_amount, status, expires_at, paid_at, customer_bank_or_wallet, outlet_id, cashier_id, created_at) 
         VALUES (?, ?, ?, 'dynamic', ?, ?, 0.7, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          o.id,
          o.ref,
          o.rrn,
          `00020101021226670016ID.CO.QRIS.WWW01189360091100000000000215MID-ID-QRIS-789123520454115303360540${o.total}5802ID5919TOKO BERKAH MANDIRI6007YOGYAKARTA6304`,
          o.total,
          mdr,
          net,
          o.status,
          now.toISOString(),
          yesterday.toISOString(),
          o.bank,
          outletId,
          cashierId,
          yesterday.toISOString()
        ]
      );
    }

    // Settlement batch
    const batchRes = await db.runAsync(
      `INSERT INTO settlement_batches (batch_id, settlement_date, pjp_name, file_name, total_records, matched_records, mismatch_records, total_gross, total_mdr, total_net) 
       VALUES (?, ?, 'XENDIT_PJP', 'SETTLEMENT-20261111.csv', 4, 2, 2, 189000, 1323, 187677)`,
      ['BATCH-20261111-01', dateStr]
    );
    const batchId = batchRes.lastID;

    // 1. Matched Item 1
    await db.runAsync(
      `INSERT INTO settlement_items (settlement_id, pjp_ref, rrn, amount_gross, mdr_amount, amount_net, paid_time, match_status, discrepancy_notes) 
       VALUES (?, 'QRIS-PJP-20261111-001', '982736182901', 46000, 322, 45678, ?, 'MATCHED', 'Cocok sempurna dengan POS')`,
      [batchId, yesterday.toISOString()]
    );

    // 2. Matched Item 2
    await db.runAsync(
      `INSERT INTO settlement_items (settlement_id, pjp_ref, rrn, amount_gross, mdr_amount, amount_net, paid_time, match_status, discrepancy_notes) 
       VALUES (?, 'QRIS-PJP-20261111-002', '982736182902', 28000, 196, 27804, ?, 'MATCHED', 'Cocok sempurna dengan POS')`,
      [batchId, yesterday.toISOString()]
    );

    // 3. Amount Mismatch (PJP settled 73000 instead of 75000)
    const mItem = await db.runAsync(
      `INSERT INTO settlement_items (settlement_id, pjp_ref, rrn, amount_gross, mdr_amount, amount_net, paid_time, match_status, discrepancy_notes) 
       VALUES (?, 'QRIS-PJP-20261111-003', '982736182903', 73000, 511, 72489, ?, 'AMOUNT_MISMATCH', 'Selisih nominal: POS Rp 75.000 vs Settlement PJP Rp 73.000 (Selisih -Rp 2.000)')`,
      [batchId, yesterday.toISOString()]
    );

    // Create discrepancy ticket for manager
    await db.runAsync(
      `INSERT INTO reconciliation_tickets (settlement_item_id, ticket_number, issue_type, status, notes) 
       VALUES (?, 'TCK-20261111-001', 'AMOUNT_MISMATCH', 'OPEN', 'Perlu konfirmasi dengan PJP terkait pemotongan saldo Rp 2.000 pada transaksi QRIS-PJP-20261111-003')`,
      [mItem.lastID]
    );

    // 4. Missing in POS (Found in bank settlement, but missing in POS database)
    const missItem = await db.runAsync(
      `INSERT INTO settlement_items (settlement_id, pjp_ref, rrn, amount_gross, mdr_amount, amount_net, paid_time, match_status, discrepancy_notes) 
       VALUES (?, 'QRIS-PJP-20261111-099', '982736182999', 42000, 294, 41706, ?, 'MISSING_IN_POS', 'Transaksi ada di settlement PJP Bank, tetapi tidak ditemukan di kasir POS')`,
      [batchId, yesterday.toISOString()]
    );

    await db.runAsync(
      `INSERT INTO reconciliation_tickets (settlement_item_id, ticket_number, issue_type, status, notes) 
       VALUES (?, 'TCK-20261111-002', 'MISSING_IN_POS', 'OPEN', 'Investigasi kasir apakah ada pembayaran QRIS statis tanpa input order')`,
      [missItem.lastID]
    );

    console.log('Created sample QRIS ledger, settlement batch, and discrepancy tickets');
  }

  console.log('Seeding completed successfully!');
}

seed().catch(console.error);
