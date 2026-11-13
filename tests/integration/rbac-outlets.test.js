'use strict';

const os = require('os');
const path = require('path');
const request = require('supertest');

const dbPath = path.join(
  os.tmpdir(),
  `pos-rbac-outlets-${process.pid}-${Date.now()}.sqlite`
);
process.env.DATABASE_PATH = dbPath;
process.env.JWT_SECRET = 'integration-rbac-outlets-secret';
process.env.PJP_WEBHOOK_SECRET = 'integration-webhook-secret';
process.env.NODE_ENV = 'test';

const { initDb, db } = require('../../server/db');
const { createApp } = require('../../server/app');
const { resetPermissions, permissionsFor } = require('../../server/services/rbac');
const {
  PASSWORD,
  authHeader,
  seedDatabase,
  loginAll,
  closeDatabase
} = require('./helpers');

let app;
let tokens;
let fixture;

const NEW_MANAGER = {
  username: 'test.manager',
  full_name: 'Manajer Baru',
  role: 'manager',
  password: 'rahasia123',
  pin: '111222'
};

const NEW_CASHIER = {
  username: 'test.cashier',
  full_name: 'Kasir Baru',
  role: 'cashier',
  password: 'rahasia123'
};

function outletPayload(overrides = {}) {
  return {
    name: 'Outlet Uji Tambahan',
    code: 'TST-01',
    address: 'Jl. Tambahan No. 2',
    phone: '081234567890',
    timezone: 'Asia/Jakarta',
    is_active: 1,
    ...overrides
  };
}

async function cleanupTestData() {
  await db.runAsync(
    "DELETE FROM user_outlets WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'test.%')"
  );
  await db.runAsync("DELETE FROM users WHERE username LIKE 'test.%'");
  await db.runAsync(
    "DELETE FROM user_outlets WHERE outlet_id IN (SELECT id FROM outlets WHERE code LIKE 'TST-%')"
  );
  await db.runAsync(
    "DELETE FROM products WHERE outlet_id IN (SELECT id FROM outlets WHERE code LIKE 'TST-%')"
  );
  await db.runAsync("DELETE FROM outlets WHERE code LIKE 'TST-%'");
  await db.runAsync("DELETE FROM settings WHERE key = 'rbac.permission_overrides'");
  resetPermissions();
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
  await cleanupTestData();
});

describe('POST /api/auth/login - session payload', () => {
  test('mengembalikan permissions, outlets, dan active_outlet_id', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'owner', password: PASSWORD.owner });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toEqual(expect.objectContaining({
      id: fixture.userIds.owner,
      role: 'owner',
      active_outlet_id: fixture.outletId
    }));
    expect(response.body.user.permissions).toEqual(expect.arrayContaining([
      'outlets.view',
      'outlets.manage',
      'users.manage',
      'roles.manage'
    ]));
    expect(response.body.user.outlets).toHaveLength(1);
    expect(response.body.user.outlets[0]).toEqual(expect.objectContaining({
      id: fixture.outletId,
      is_primary: true
    }));
  });

  test('menolak login untuk username yang tidak terdaftar', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'tidak.ada', password: 'salah12345' });

    expect(response.status).toBe(401);
  });
});

describe('GET /api/outlets', () => {
  test('owner melihat seluruh outlet dan boleh mengelola', async () => {
    const response = await request(app)
      .get('/api/outlets')
      .set(authHeader(tokens.owner));

    expect(response.status).toBe(200);
    expect(response.body.can_manage).toBe(true);
    expect(response.body.outlets).toHaveLength(1);
    expect(response.body.outlets[0].id).toBe(fixture.outletId);
  });

  test('manager dapat melihat tetapi tidak boleh mengelola', async () => {
    const response = await request(app)
      .get('/api/outlets')
      .set(authHeader(tokens.manager));

    expect(response.status).toBe(200);
    expect(response.body.can_manage).toBe(false);
  });

  test('kasir ditolak karena tidak memiliki outlets.view', async () => {
    const response = await request(app)
      .get('/api/outlets')
      .set(authHeader(tokens.cashier));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');
  });
});

describe('POST/PUT/DELETE /api/outlets', () => {
  test('owner dapat membuat outlet baru dengan kode unik', async () => {
    const response = await request(app)
      .post('/api/outlets')
      .set(authHeader(tokens.owner))
      .send(outletPayload());

    expect(response.status).toBe(201);
    expect(response.body.outlet).toEqual(expect.objectContaining({
      code: 'TST-01',
      is_active: 1
    }));
  });

  test('menolak kode outlet duplikat', async () => {
    const response = await request(app)
      .post('/api/outlets')
      .set(authHeader(tokens.owner))
      .send(outletPayload({ code: 'TEST-01' }));

    expect(response.status).toBe(409);
  });

  test('manager tidak dapat membuat outlet', async () => {
    const response = await request(app)
      .post('/api/outlets')
      .set(authHeader(tokens.manager))
      .send(outletPayload());

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');
  });

  test('menolak menonaktifkan outlet aktif terakhir', async () => {
    const response = await request(app)
      .put(`/api/outlets/${fixture.outletId}`)
      .set(authHeader(tokens.owner))
      .send({ is_active: 0 });

    expect(response.status).toBe(409);
  });

  test('menghapus outlet kosong berhasil, tetapi outlet terpakai ditolak', async () => {
    const created = await request(app)
      .post('/api/outlets')
      .set(authHeader(tokens.owner))
      .send(outletPayload({ code: 'TST-DEL' }));

    expect(created.status).toBe(201);

    const removed = await request(app)
      .delete(`/api/outlets/${created.body.outlet.id}`)
      .set(authHeader(tokens.owner));

    expect(removed.status).toBe(200);

    const inUse = await request(app)
      .delete(`/api/outlets/${fixture.outletId}`)
      .set(authHeader(tokens.owner));

    expect(inUse.status).toBe(409);
  });
});

describe('Outlet scoping', () => {
  test('X-Outlet-Id membatasi data produk pada outlet aktif', async () => {
    const created = await request(app)
      .post('/api/outlets')
      .set(authHeader(tokens.owner))
      .send(outletPayload({ code: 'TST-SCOPE' }));

    const outletId = created.body.outlet.id;

    await db.runAsync(
      `INSERT INTO products (outlet_id, category_id, name, sku, unit, cost_price, selling_price, stock, min_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [outletId, fixture.categoryId, 'Produk Outlet Kedua', 'TST-PROD-1', 'pcs', 1000, 2000, 10, 1]
    );

    const scoped = await request(app)
      .get('/api/products')
      .set(authHeader(tokens.owner))
      .set('X-Outlet-Id', String(outletId));

    expect(scoped.status).toBe(200);
    expect(scoped.body.products).toHaveLength(1);
    expect(scoped.body.products[0].sku).toBe('TST-PROD-1');

    const primary = await request(app)
      .get('/api/products')
      .set(authHeader(tokens.owner));

    expect(primary.status).toBe(200);
    expect(primary.body.products.some((product) => product.sku === 'TST-PROD-1')).toBe(false);
  });

  test('menolak outlet yang tidak diketahui atau tidak diotorisasi', async () => {
    const unknown = await request(app)
      .get('/api/products')
      .set(authHeader(tokens.owner))
      .set('X-Outlet-Id', '999999');

    expect(unknown.status).toBe(403);
    expect(unknown.body.code).toBe('OUTLET_FORBIDDEN');

    const created = await request(app)
      .post('/api/outlets')
      .set(authHeader(tokens.owner))
      .send(outletPayload({ code: 'TST-NOGRANT' }));

    const forbidden = await request(app)
      .get('/api/products')
      .set(authHeader(tokens.cashier))
      .set('X-Outlet-Id', String(created.body.outlet.id));

    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('OUTLET_FORBIDDEN');
  });
});

describe('GET/PUT /api/roles', () => {
  test('owner melihat matriks izin lengkap', async () => {
    const response = await request(app)
      .get('/api/roles')
      .set(authHeader(tokens.owner));

    expect(response.status).toBe(200);
    expect(response.body.can_manage).toBe(true);
    expect(response.body.matrix).toEqual(expect.any(Object));
    expect(response.body.matrix['users.manage']).toEqual(['owner']);
    expect(response.body.catalog.length).toBeGreaterThan(0);
    expect(response.body.locked_permissions).toEqual(expect.arrayContaining([
      'users.manage',
      'roles.manage',
      'settings.manage'
    ]));
  });

  test('manager dapat melihat daftar peran tanpa matriks', async () => {
    const response = await request(app)
      .get('/api/roles')
      .set(authHeader(tokens.manager));

    expect(response.status).toBe(200);
    expect(response.body.matrix).toBeNull();
    expect(response.body.can_manage).toBe(false);
    expect(response.body.roles.length).toBeGreaterThan(0);
  });

  test('kasir tidak dapat membuka katalog peran', async () => {
    const response = await request(app)
      .get('/api/roles')
      .set(authHeader(tokens.cashier));

    expect(response.status).toBe(403);
  });

  test('owner dapat mengubah izin dan perubahan tercermin pada sesi', async () => {
    const response = await request(app)
      .put('/api/roles/permissions')
      .set(authHeader(tokens.owner))
      .send({ permissions: { 'reports.view': ['owner'] } });

    expect(response.status).toBe(200);
    expect(response.body.matrix['reports.view']).toEqual(['owner']);
    expect(permissionsFor('manager')).not.toContain('reports.view');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'manager', password: PASSWORD.manager });

    expect(login.body.user.permissions).not.toContain('reports.view');

    // The matrix is enforced by the API, not only by the hidden UI controls.
    const blocked = await request(app)
      .get('/api/reports/financial')
      .set(authHeader(tokens.manager));

    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PERMISSION_DENIED');
  });

  test('menolak pencabutan izin owner yang dikunci', async () => {
    const response = await request(app)
      .put('/api/roles/permissions')
      .set(authHeader(tokens.owner))
      .send({ permissions: { 'users.manage': ['manager'] } });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_PERMISSION_MATRIX');
  });

  test('manager tidak dapat mengubah matriks izin', async () => {
    const response = await request(app)
      .put('/api/roles/permissions')
      .set(authHeader(tokens.manager))
      .send({ permissions: { 'reports.view': ['owner'] } });

    expect(response.status).toBe(403);
  });
});

describe('Staff provisioning /api/users', () => {
  test('owner melihat seluruh staf dan boleh mengelola', async () => {
    const response = await request(app)
      .get('/api/users')
      .set(authHeader(tokens.owner));

    expect(response.status).toBe(200);
    expect(response.body.can_manage).toBe(true);
    expect(response.body.users).toHaveLength(3);
    expect(response.body.users[0]).not.toHaveProperty('password_hash');
  });

  test('manager hanya melihat staf pada outlet yang diotorisasi', async () => {
    const response = await request(app)
      .get('/api/users')
      .set(authHeader(tokens.manager));

    expect(response.status).toBe(200);
    expect(response.body.can_manage).toBe(false);
    expect(response.body.users.every((staff) => staff.role !== 'owner')).toBe(true);
  });

  test('cashier ditolak karena tidak memiliki users.view', async () => {
    const response = await request(app)
      .get('/api/users')
      .set(authHeader(tokens.cashier));

    expect(response.status).toBe(403);
  });

  test('owner membuat akun manager dengan PIN dan outlet', async () => {
    const response = await request(app)
      .post('/api/users')
      .set(authHeader(tokens.owner))
      .send({
        ...NEW_MANAGER,
        outlet_ids: [fixture.outletId],
        primary_outlet_id: fixture.outletId
      });

    expect(response.status).toBe(201);
    expect(response.body.user).toEqual(expect.objectContaining({
      username: NEW_MANAGER.username,
      role: 'manager',
      has_pin: true,
      is_locked: false
    }));
    expect(response.body.user.outlets).toHaveLength(1);
    expect(response.body.user.outlets[0]).toEqual(expect.objectContaining({
      id: fixture.outletId,
      is_primary: true
    }));

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: NEW_MANAGER.username, password: NEW_MANAGER.password });

    expect(login.status).toBe(200);
    expect(login.body.user.outlets[0].id).toBe(fixture.outletId);
  });

  test('menolak PIN tidak valid dan outlet kosong', async () => {
    const badPin = await request(app)
      .post('/api/users')
      .set(authHeader(tokens.owner))
      .send({ ...NEW_MANAGER, pin: '123', outlet_ids: [fixture.outletId], primary_outlet_id: fixture.outletId });

    expect(badPin.status).toBe(400);

    const noOutlet = await request(app)
      .post('/api/users')
      .set(authHeader(tokens.owner))
      .send({ ...NEW_MANAGER, outlet_ids: [] });

    expect(noOutlet.status).toBe(400);
  });

  test('menolak username duplikat', async () => {
    const response = await request(app)
      .post('/api/users')
      .set(authHeader(tokens.owner))
      .send({
        ...NEW_MANAGER,
        username: 'kasir',
        outlet_ids: [fixture.outletId],
        primary_outlet_id: fixture.outletId
      });

    expect(response.status).toBe(409);
  });

  test('manager tidak dapat membuat akun staf', async () => {
    const response = await request(app)
      .post('/api/users')
      .set(authHeader(tokens.manager))
      .send({
        ...NEW_CASHIER,
        outlet_ids: [fixture.outletId],
        primary_outlet_id: fixture.outletId
      });

    expect(response.status).toBe(403);
  });

  test('owner dapat mengunci akun dan login berikutnya ditolak', async () => {
    const created = await request(app)
      .post('/api/users')
      .set(authHeader(tokens.owner))
      .send({
        ...NEW_CASHIER,
        outlet_ids: [fixture.outletId],
        primary_outlet_id: fixture.outletId
      });

    const locked = await request(app)
      .put(`/api/users/${created.body.user.id}`)
      .set(authHeader(tokens.owner))
      .send({ is_locked: true });

    expect(locked.status).toBe(200);
    expect(locked.body.user.is_locked).toBe(true);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: NEW_CASHIER.username, password: NEW_CASHIER.password });

    expect(login.status).toBe(403);
    expect(login.body.code).toBe('USER_LOCKED');
  });

  test('menghapus akun tanpa riwayat, tetapi menolak akun dengan shift', async () => {
    const created = await request(app)
      .post('/api/users')
      .set(authHeader(tokens.owner))
      .send({
        ...NEW_CASHIER,
        outlet_ids: [fixture.outletId],
        primary_outlet_id: fixture.outletId
      });

    const removed = await request(app)
      .delete(`/api/users/${created.body.user.id}`)
      .set(authHeader(tokens.owner));

    expect(removed.status).toBe(200);

    const withHistory = await request(app)
      .delete(`/api/users/${fixture.userIds.cashier}`)
      .set(authHeader(tokens.owner));

    expect(withHistory.status).toBe(409);
    expect(withHistory.body.code).toBe('USER_HAS_HISTORY');
  });

  test('owner tidak dapat menghapus akunnya sendiri', async () => {
    const response = await request(app)
      .delete(`/api/users/${fixture.userIds.owner}`)
      .set(authHeader(tokens.owner));

    expect(response.status).toBe(409);
  });
});
