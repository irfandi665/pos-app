'use strict';

const { db, withTransaction } = require('../db');
const { ROLES, isValidRole } = require('./rbac');

const OUTLET_SELECT = `
  SELECT o.*,
    (SELECT COUNT(*) FROM users u WHERE u.outlet_id = o.id) AS user_count,
    (SELECT COUNT(*) FROM products p WHERE p.outlet_id = o.id AND p.is_active = 1) AS product_count,
    (SELECT COUNT(*) FROM orders od WHERE od.outlet_id = o.id) AS order_count
  FROM outlets o
`;

function isOwner(user) {
  return Boolean(user) && user.role === ROLES.OWNER;
}

/**
 * Returns every outlet the user may open. Owners see all outlets; other roles
 * only see outlets explicitly granted through the user_outlets table.
 */
async function listAccessibleOutlets(user, { activeOnly = false } = {}) {
  if (!user) return [];

  if (isOwner(user)) {
    const where = activeOnly ? 'WHERE o.is_active = 1' : '';
    return db.allAsync(`${OUTLET_SELECT} ${where} ORDER BY o.is_active DESC, o.name ASC`);
  }

  const params = [user.id, user.id];

  return db.allAsync(
    `${OUTLET_SELECT}
     WHERE o.id IN (
       SELECT outlet_id FROM user_outlets WHERE user_id = ?
       UNION
       SELECT outlet_id FROM users WHERE id = ? AND outlet_id IS NOT NULL
     )
     ${activeOnly ? 'AND o.is_active = 1' : ''}
     ORDER BY CASE WHEN o.id = (SELECT outlet_id FROM users WHERE id = ?) THEN 0 ELSE 1 END, o.name ASC`,
    [...params, user.id]
  );
}

async function userCanAccessOutlet(user, outletId) {
  const parsed = Number.parseInt(outletId, 10);
  if (!user || !Number.isInteger(parsed) || parsed <= 0) return false;

  if (isOwner(user)) {
    const outlet = await db.getAsync('SELECT id FROM outlets WHERE id = ?', [parsed]);
    return Boolean(outlet);
  }

  const row = await db.getAsync(
    `SELECT 1 AS allowed
     FROM outlets o
     WHERE o.id = ? AND o.is_active = 1
       AND (
         o.id = (SELECT outlet_id FROM users WHERE id = ?)
         OR o.id IN (SELECT outlet_id FROM user_outlets WHERE user_id = ?)
       )`,
    [parsed, user.id, user.id]
  );
  return Boolean(row);
}

function readRequestedOutletId(req) {
  const rawValue = req.headers['x-outlet-id']
    ?? (req.query ? req.query.outlet_id : undefined)
    ?? (req.body ? req.body.outlet_id : undefined);

  if (rawValue === undefined || rawValue === null || rawValue === '') return null;

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsed) && String(parsed) === String(rawValue).trim() ? parsed : NaN;
}

/**
 * Resolves the active outlet for a request from the X-Outlet-Id header (or an
 * outlet_id query/body fallback), verifies access, and exposes it as
 * req.outletId for downstream handlers.
 */
async function resolveOutletContext(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Harap masuk terlebih dahulu', code: 'AUTH_TOKEN_MISSING' });
  }

  try {
    const outlets = await listAccessibleOutlets(req.user);
    if (!outlets.length) {
      return res.status(403).json({
        error: 'Akun Anda belum diotorisasi untuk outlet mana pun',
        code: 'OUTLET_NOT_ASSIGNED'
      });
    }

    const requestedId = readRequestedOutletId(req);
    if (Number.isNaN(requestedId)) {
      return res.status(400).json({ error: 'Header X-Outlet-Id tidak valid', code: 'INVALID_OUTLET_ID' });
    }

    let selected;
    if (requestedId) {
      selected = outlets.find((outlet) => outlet.id === requestedId);
      if (!selected) {
        return res.status(403).json({
          error: 'Akses ditolak: Anda tidak memiliki akses ke outlet tersebut',
          code: 'OUTLET_FORBIDDEN'
        });
      }
    } else {
      const primary = outlets.find((outlet) => outlet.id === req.user.outlet_id);
      selected = primary || outlets.find((outlet) => outlet.is_active) || outlets[0];
    }

    req.outlet = selected || null;
    req.outletId = selected ? selected.id : null;
    req.accessibleOutlets = outlets;
    next();
  } catch (err) {
    next(err);
  }
}

function normalizeOutletIds(rawIds) {
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return { ids: [], error: 'Minimal satu outlet harus dipilih' };
  }

  const ids = [];
  for (const rawId of rawIds) {
    const parsed = Number.parseInt(rawId, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { ids: [], error: 'ID outlet tidak valid' };
    }
    if (!ids.includes(parsed)) ids.push(parsed);
  }

  return { ids, error: null };
}

/**
 * Validates outlet grants and returns the normalized ids plus the primary id.
 * Throws a 400 error when the payload is invalid.
 */
async function validateOutletGrants(rawOutletIds, primaryOutletId) {
  const parsedPrimary = Number.parseInt(primaryOutletId, 10);
  const { ids, error } = normalizeOutletIds(rawOutletIds);
  if (error) {
    const err = new Error(error);
    err.statusCode = 400;
    throw err;
  }

  if (!Number.isInteger(parsedPrimary) || !ids.includes(parsedPrimary)) {
    const err = new Error('Outlet utama harus termasuk dalam daftar outlet yang diotorisasi');
    err.statusCode = 400;
    throw err;
  }

  const placeholders = ids.map(() => '?').join(', ');
  const outlets = await db.allAsync(
    `SELECT id, is_active FROM outlets WHERE id IN (${placeholders})`,
    ids
  );

  if (outlets.length !== ids.length) {
    const err = new Error('Salah satu outlet tidak ditemukan');
    err.statusCode = 400;
    throw err;
  }

  if (outlets.some((outlet) => !outlet.is_active)) {
    const err = new Error('Outlet nonaktif tidak dapat diotorisasi ke staf');
    err.statusCode = 400;
    throw err;
  }

  return { ids, primaryId: parsedPrimary };
}

/** Replaces grants without opening a transaction (caller owns the transaction). */
async function replaceUserOutlets(userId, ids, primaryId) {
  await db.runAsync('DELETE FROM user_outlets WHERE user_id = ?', [userId]);
  for (const outletId of ids) {
    await db.runAsync(
      `INSERT INTO user_outlets (user_id, outlet_id, is_primary) VALUES (?, ?, ?)`,
      [userId, outletId, outletId === primaryId ? 1 : 0]
    );
  }
  await db.runAsync('UPDATE users SET outlet_id = ? WHERE id = ?', [primaryId, userId]);
  return ids;
}

/**
 * Replaces a user's outlet grants atomically and keeps users.outlet_id aligned
 * with the chosen primary outlet.
 */
async function syncUserOutlets(userId, rawOutletIds, primaryOutletId) {
  const { ids, primaryId } = await validateOutletGrants(rawOutletIds, primaryOutletId);
  return withTransaction(() => replaceUserOutlets(userId, ids, primaryId));
}

function assertValidRole(role) {
  if (!isValidRole(role)) {
    const err = new Error('Peran tidak valid');
    err.statusCode = 400;
    throw err;
  }
}

module.exports = {
  isOwner,
  listAccessibleOutlets,
  userCanAccessOutlet,
  readRequestedOutletId,
  resolveOutletContext,
  normalizeOutletIds,
  validateOutletGrants,
  replaceUserOutlets,
  syncUserOutlets,
  assertValidRole
};
