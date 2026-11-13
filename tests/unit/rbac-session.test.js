'use strict';

jest.mock('../../server/db', () => ({
  db: {
    allAsync: jest.fn(),
    runAsync: jest.fn(),
    getAsync: jest.fn()
  },
  initDb: jest.fn(),
  withTransaction: jest.fn()
}));

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../../server/db');
const {
  JWT_SECRET,
  generateToken,
  authenticateToken,
  requireRole,
  verifyManagerPin
} = require('../../server/auth');
const {
  can,
  isAtLeast,
  isValidRole,
  requirePermission,
  requireMinimumRole
} = require('../../server/services/rbac');

function createResponse() {
  const res = { statusCode: 200, body: null };
  res.status = jest.fn(function setStatus(code) {
    this.statusCode = code;
    return this;
  });
  res.json = jest.fn(function sendJson(body) {
    this.body = body;
    return this;
  });
  return res;
}

function createRequest(overrides = {}) {
  return {
    headers: {},
    body: {},
    ...overrides
  };
}

describe('Session state (JWT)', () => {
  const user = {
    id: 3,
    username: 'kasir',
    full_name: 'Siti Rahmawati',
    role: 'cashier',
    outlet_id: 1
  };

  beforeEach(() => {
    db.allAsync.mockReset();
    db.runAsync.mockReset().mockResolvedValue({ changes: 1, lastID: 1 });
    db.getAsync.mockReset();
  });

  test('membuat token 24 jam dengan klaim peran dan outlet', () => {
    const token = generateToken(user);
    const decoded = jwt.verify(token, JWT_SECRET);

    expect(decoded).toEqual(expect.objectContaining({
      id: 3,
      username: 'kasir',
      role: 'cashier',
      outlet_id: 1
    }));
    expect(decoded.exp - decoded.iat).toBe(24 * 60 * 60);
  });

  test('menerima token valid dan mengisi req.user', () => {
    const req = createRequest({
      headers: { authorization: `Bearer ${generateToken(user)}` }
    });
    const res = createResponse();
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual(expect.objectContaining({
      id: 3,
      role: 'cashier',
      outlet_id: 1
    }));
    expect(res.status).not.toHaveBeenCalled();
  });

  test('menolak request tanpa token dengan 401', () => {
    const res = createResponse();
    const next = jest.fn();

    authenticateToken(createRequest(), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error).toMatch(/token tidak ditemukan/i);
    expect(next).not.toHaveBeenCalled();
  });

  test('menolak token kedaluwarsa dengan 403', () => {
    const expiredToken = jwt.sign(
      { id: 3, role: 'cashier', outlet_id: 1 },
      JWT_SECRET,
      { expiresIn: -1 }
    );
    const req = createRequest({
      headers: { authorization: `Bearer ${expiredToken}` }
    });
    const res = createResponse();
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error).toMatch(/kedaluwarsa|tidak valid/i);
    expect(next).not.toHaveBeenCalled();
  });

  test('menolak token dengan signature yang salah', () => {
    const forgedToken = jwt.sign(
      { id: 3, role: 'owner', outlet_id: 1 },
      'wrong-secret'
    );
    const req = createRequest({
      headers: { authorization: `Bearer ${forgedToken}` }
    });
    const res = createResponse();
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('Role-based access control', () => {
  test('kasir tidak boleh melakukan aksi manajer', () => {
    expect(can('cashier', 'pos.checkout')).toBe(true);
    expect(can('cashier', 'orders.void')).toBe(false);
    expect(can('cashier', 'reports.view')).toBe(false);
    expect(can('cashier', 'settings.manage')).toBe(false);
  });

  test('manajer boleh void, retur, dan laporan tetapi tidak mengubah pengaturan', () => {
    expect(can('manager', 'orders.void')).toBe(true);
    expect(can('manager', 'orders.return')).toBe(true);
    expect(can('manager', 'stock.opname')).toBe(true);
    expect(can('manager', 'settings.manage')).toBe(false);
  });

  test('owner memiliki seluruh izin', () => {
    expect(can('owner', 'settings.manage')).toBe(true);
    expect(can('owner', 'users.manage')).toBe(true);
    expect(can('owner', 'orders.void')).toBe(true);
    expect(isAtLeast('owner', 'manager')).toBe(true);
    expect(isAtLeast('cashier', 'manager')).toBe(false);
  });

  test('memvalidasi nama peran dan hierarki peran', () => {
    expect(isValidRole('cashier')).toBe(true);
    expect(isValidRole('admin')).toBe(false);
    expect(isAtLeast('manager', 'cashier')).toBe(true);
    expect(isAtLeast('unknown', 'cashier')).toBe(false);
  });

  test('requireRole menolak kasir dan mengizinkan manajer', () => {
    const middleware = requireRole(['manager', 'owner']);

    const cashierRes = createResponse();
    const cashierNext = jest.fn();
    middleware({ user: { role: 'cashier' } }, cashierRes, cashierNext);

    expect(cashierRes.status).toHaveBeenCalledWith(403);
    expect(cashierNext).not.toHaveBeenCalled();

    const managerRes = createResponse();
    const managerNext = jest.fn();
    middleware({ user: { role: 'manager' } }, managerRes, managerNext);

    expect(managerNext).toHaveBeenCalledTimes(1);
    expect(managerRes.status).not.toHaveBeenCalled();
  });

  test('requirePermission dan requireMinimumRole menolak tanpa sesi', () => {
    const permissionRes = createResponse();
    const permissionNext = jest.fn();
    requirePermission('orders.void')(createRequest(), permissionRes, permissionNext);

    expect(permissionRes.status).toHaveBeenCalledWith(401);
    expect(permissionNext).not.toHaveBeenCalled();

    const roleRes = createResponse();
    const roleNext = jest.fn();
    requireMinimumRole('owner')({ user: { role: 'manager' } }, roleRes, roleNext);

    expect(roleRes.status).toHaveBeenCalledWith(403);
    expect(roleNext).not.toHaveBeenCalled();
  });
});

describe('Manager PIN authorization', () => {
  const managerPin = '654321';
  const managerHash = bcrypt.hashSync(managerPin, 4);
  const ownerHash = bcrypt.hashSync('123456', 4);

  beforeEach(() => {
    db.allAsync.mockReset();
    db.runAsync.mockReset().mockResolvedValue({ changes: 1, lastID: 1 });
  });

  test('mengizinkan PIN manajer yang benar dan mereset percobaan gagal', async () => {
    db.allAsync.mockResolvedValue([
      {
        id: 2,
        username: 'manager',
        full_name: 'Budi Santoso',
        pin_hash: managerHash,
        failed_pin_attempts: 2,
        is_locked: 0
      },
      {
        id: 1,
        username: 'owner',
        full_name: 'Hendra Wijaya',
        pin_hash: ownerHash,
        failed_pin_attempts: 0,
        is_locked: 0
      }
    ]);

    const req = createRequest({
      headers: { 'x-manager-pin': managerPin }
    });
    const res = createResponse();
    const next = jest.fn();

    await verifyManagerPin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.manager).toEqual(expect.objectContaining({
      id: 2,
      username: 'manager',
      full_name: 'Budi Santoso'
    }));
    expect(db.runAsync).toHaveBeenCalledWith(
      'UPDATE users SET failed_pin_attempts = 0 WHERE id = ?',
      [2]
    );
  });

  test('menolak PIN salah dan menaikkan failed attempts', async () => {
    db.allAsync.mockResolvedValue([
      {
        id: 2,
        username: 'manager',
        full_name: 'Budi Santoso',
        pin_hash: managerHash,
        failed_pin_attempts: 0,
        is_locked: 0
      }
    ]);

    const req = createRequest({
      headers: { 'x-manager-pin': '000000' }
    });
    const res = createResponse();
    const next = jest.fn();

    await verifyManagerPin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('failed_pin_attempts = failed_pin_attempts + 1')
    );
  });

  test('menolak PIN ketika semua manajer terkunci', async () => {
    db.allAsync.mockResolvedValue([
      {
        id: 2,
        username: 'manager',
        full_name: 'Budi Santoso',
        pin_hash: managerHash,
        failed_pin_attempts: 5,
        is_locked: 1
      }
    ]);

    const req = createRequest({
      headers: { 'x-manager-pin': managerPin }
    });
    const res = createResponse();
    const next = jest.fn();

    await verifyManagerPin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('menolak request tanpa PIN dengan 403', async () => {
    const res = createResponse();
    const next = jest.fn();

    await verifyManagerPin(createRequest(), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(db.allAsync).not.toHaveBeenCalled();
  });
});
