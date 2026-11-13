'use strict';

const { db } = require('../db');

const ROLES = Object.freeze({
  CASHIER: 'cashier',
  MANAGER: 'manager',
  OWNER: 'owner'
});

const ROLE_LABELS = Object.freeze({
  [ROLES.CASHIER]: 'Kasir',
  [ROLES.MANAGER]: 'Manajer',
  [ROLES.OWNER]: 'Owner'
});

const ROLE_LEVELS = Object.freeze({
  [ROLES.CASHIER]: 1,
  [ROLES.MANAGER]: 2,
  [ROLES.OWNER]: 3
});

const DEFAULT_PERMISSIONS = Object.freeze({
  'pos.checkout': [ROLES.CASHIER, ROLES.MANAGER, ROLES.OWNER],
  'pos.hold_bill': [ROLES.CASHIER, ROLES.MANAGER, ROLES.OWNER],
  'shifts.manage_own': [ROLES.CASHIER, ROLES.MANAGER, ROLES.OWNER],
  'qris.view': [ROLES.CASHIER, ROLES.MANAGER, ROLES.OWNER],
  'customers.view': [ROLES.CASHIER, ROLES.MANAGER, ROLES.OWNER],
  'products.view': [ROLES.CASHIER, ROLES.MANAGER, ROLES.OWNER],
  'products.manage': [ROLES.MANAGER, ROLES.OWNER],
  'stock.opname': [ROLES.MANAGER, ROLES.OWNER],
  'orders.void': [ROLES.MANAGER, ROLES.OWNER],
  'orders.return': [ROLES.MANAGER, ROLES.OWNER],
  'reconcile.manage': [ROLES.MANAGER, ROLES.OWNER],
  'reports.view': [ROLES.MANAGER, ROLES.OWNER],
  'audit.view': [ROLES.MANAGER, ROLES.OWNER],
  'outlets.view': [ROLES.MANAGER, ROLES.OWNER],
  'outlets.manage': [ROLES.OWNER],
  'users.view': [ROLES.MANAGER, ROLES.OWNER],
  'users.manage': [ROLES.OWNER],
  'roles.view': [ROLES.OWNER],
  'roles.manage': [ROLES.OWNER],
  'settings.manage': [ROLES.OWNER]
});

const PERMISSION_CATALOG = Object.freeze([
  { key: 'pos.checkout', group: 'POS', label: 'Proses checkout', description: 'Membuat transaksi penjualan baru di kasir.' },
  { key: 'pos.hold_bill', group: 'POS', label: 'Hold bill', description: 'Menyimpan dan melanjutkan tagihan tertunda.' },
  { key: 'shifts.manage_own', group: 'POS', label: 'Kelola shift sendiri', description: 'Buka/tutup shift dan catat kas masuk-keluar.' },
  { key: 'qris.view', group: 'POS', label: 'Lihat ledger QRIS', description: 'Melihat status transaksi QRIS dinamis.' },
  { key: 'customers.view', group: 'POS', label: 'Lihat pelanggan', description: 'Melihat dan mendaftarkan pelanggan CRM.' },
  { key: 'products.view', group: 'Inventori', label: 'Lihat produk', description: 'Melihat katalog, stok, dan harga produk.' },
  { key: 'products.manage', group: 'Inventori', label: 'Kelola produk', description: 'Tambah, ubah, dan hapus produk atau kategori.' },
  { key: 'stock.opname', group: 'Inventori', label: 'Stock opname', description: 'Melakukan penyesuaian stok fisik dengan otorisasi PIN.' },
  { key: 'orders.void', group: 'Transaksi', label: 'Void transaksi', description: 'Membatalkan transaksi yang sudah dibayar.' },
  { key: 'orders.return', group: 'Transaksi', label: 'Retur & refund', description: 'Memproses pengembalian dana pelanggan.' },
  { key: 'reconcile.manage', group: 'Rekonsiliasi', label: 'Kelola rekonsiliasi', description: 'Mengunggah settlement dan menyelesaikan tiket selisih.' },
  { key: 'reports.view', group: 'Rekonsiliasi', label: 'Lihat laporan', description: 'Melihat laporan keuangan dan performa penjualan.' },
  { key: 'audit.view', group: 'Rekonsiliasi', label: 'Lihat audit log', description: 'Melihat jejak aktivitas pengguna dan sistem.' },
  { key: 'outlets.view', group: 'Administrasi', label: 'Lihat outlet', description: 'Melihat daftar outlet dan berpindah outlet aktif.' },
  { key: 'outlets.manage', group: 'Administrasi', label: 'Kelola outlet', description: 'Menambah, mengubah, dan menonaktifkan outlet.' },
  { key: 'users.view', group: 'Administrasi', label: 'Lihat staf', description: 'Melihat daftar staf dan outlet yang diotorisasi.' },
  { key: 'users.manage', group: 'Administrasi', label: 'Kelola staf', description: 'Membuat akun staf, mengatur peran, PIN, dan outlet.' },
  { key: 'roles.view', group: 'Administrasi', label: 'Lihat matriks izin', description: 'Melihat pemetaan izin untuk setiap peran.' },
  { key: 'roles.manage', group: 'Administrasi', label: 'Kelola matriks izin', description: 'Mengubah izin yang melekat pada tiap peran.' },
  { key: 'settings.manage', group: 'Administrasi', label: 'Kelola pengaturan', description: 'Mengubah konfigurasi toko, pajak, dan QRIS.' }
]);

// Izin yang tidak boleh dicabut dari owner agar sistem tidak terkunci permanen.
const LOCKED_PERMISSIONS = Object.freeze(['users.manage', 'roles.manage', 'settings.manage']);

const PERMISSIONS_SETTING_KEY = 'rbac.permission_overrides';

function cloneMatrix(source) {
  const result = {};
  Object.keys(source).forEach((key) => {
    result[key] = [...source[key]];
  });
  return result;
}

let permissionMatrix = cloneMatrix(DEFAULT_PERMISSIONS);

function isValidRole(role) {
  return Object.prototype.hasOwnProperty.call(ROLE_LEVELS, role);
}

function isAtLeast(role, minimumRole) {
  return isValidRole(role) && isValidRole(minimumRole) && ROLE_LEVELS[role] >= ROLE_LEVELS[minimumRole];
}

function can(role, permission) {
  const allowedRoles = permissionMatrix[permission];
  return Array.isArray(allowedRoles) && allowedRoles.includes(role);
}

function permissionsFor(role) {
  return Object.keys(permissionMatrix).filter((permission) => can(role, permission));
}

function getPermissionMatrix() {
  return cloneMatrix(permissionMatrix);
}

function getPermissionCatalog() {
  return PERMISSION_CATALOG.map((entry) => ({
    ...entry,
    locked: LOCKED_PERMISSIONS.includes(entry.key)
  }));
}

function getRoleCatalog() {
  return Object.values(ROLES).map((role) => ({
    id: role,
    label: ROLE_LABELS[role],
    level: ROLE_LEVELS[role],
    permissions: permissionsFor(role)
  }));
}

/**
 * Validates a partial permission matrix update against the permission catalog.
 * Unknown permissions and roles are rejected; every permission must keep at
 * least one role, and critical owner permissions cannot be removed.
 */
function validateMatrix(input, baseMatrix = permissionMatrix) {
  const errors = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { matrix: null, errors: ['Matriks izin harus berupa objek'] };
  }

  const next = cloneMatrix(baseMatrix);
  const knownPermissions = new Set(PERMISSION_CATALOG.map((entry) => entry.key));

  Object.keys(input).forEach((permission) => {
    if (!knownPermissions.has(permission)) {
      errors.push(`Izin tidak dikenal: ${permission}`);
      return;
    }

    const roles = input[permission];
    if (!Array.isArray(roles) || roles.length === 0) {
      errors.push(`Izin ${permission} harus memiliki minimal satu peran`);
      return;
    }

    const uniqueRoles = [...new Set(roles)];
    const invalidRole = uniqueRoles.find((role) => !isValidRole(role));
    if (invalidRole) {
      errors.push(`Peran tidak valid untuk ${permission}: ${invalidRole}`);
      return;
    }

    next[permission] = uniqueRoles;
  });

  LOCKED_PERMISSIONS.forEach((permission) => {
    if (!next[permission]?.includes(ROLES.OWNER)) {
      errors.push(`Izin ${permission} wajib tetap dimiliki Owner`);
    }
  });

  return { matrix: errors.length ? null : next, errors };
}

function applyMatrix(matrix) {
  permissionMatrix = cloneMatrix(matrix);
  return getPermissionMatrix();
}

/** Loads persisted overrides from the settings table. Called once at boot. */
async function initializePermissions() {
  try {
    const row = await db.getAsync('SELECT value FROM settings WHERE key = ?', [PERMISSIONS_SETTING_KEY]);
    if (!row || !row.value) return getPermissionMatrix();

    const parsed = JSON.parse(row.value);
    const { matrix, errors } = validateMatrix(parsed);
    if (errors.length) {
      console.warn('RBAC override diabaikan:', errors.join('; '));
      return getPermissionMatrix();
    }

    return applyMatrix(matrix);
  } catch (err) {
    console.error('Gagal memuat override RBAC:', err.message);
    return getPermissionMatrix();
  }
}

async function savePermissionMatrix(updates) {
  const { matrix, errors } = validateMatrix(updates);
  if (errors.length) {
    const error = new Error(errors.join('; '));
    error.statusCode = 400;
    error.code = 'INVALID_PERMISSION_MATRIX';
    throw error;
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO settings (key, value, description) VALUES (?, ?, ?)`,
    [PERMISSIONS_SETTING_KEY, JSON.stringify(matrix), 'Override matriks izin RBAC per peran']
  );

  return applyMatrix(matrix);
}

function resetPermissions() {
  return applyMatrix(DEFAULT_PERMISSIONS);
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Harap masuk terlebih dahulu' });
    }

    if (!can(req.user.role, permission)) {
      return res.status(403).json({
        error: 'Akses ditolak: peran Anda tidak memiliki izin untuk tindakan ini',
        code: 'PERMISSION_DENIED',
        permission
      });
    }

    next();
  };
}

function requireMinimumRole(minimumRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Harap masuk terlebih dahulu' });
    }

    if (!isAtLeast(req.user.role, minimumRole)) {
      return res.status(403).json({
        error: `Akses ditolak: dibutuhkan peran minimal ${minimumRole}`
      });
    }

    next();
  };
}

module.exports = {
  ROLES,
  ROLE_LABELS,
  ROLE_LEVELS,
  PERMISSIONS: DEFAULT_PERMISSIONS,
  DEFAULT_PERMISSIONS,
  PERMISSION_CATALOG,
  LOCKED_PERMISSIONS,
  PERMISSIONS_SETTING_KEY,
  isValidRole,
  isAtLeast,
  can,
  permissionsFor,
  getPermissionMatrix,
  getPermissionCatalog,
  getRoleCatalog,
  initializePermissions,
  savePermissionMatrix,
  resetPermissions,
  requirePermission,
  requireMinimumRole
};
