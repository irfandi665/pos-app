'use strict';

const ROLES = Object.freeze({
  CASHIER: 'cashier',
  MANAGER: 'manager',
  OWNER: 'owner'
});

const ROLE_LEVELS = Object.freeze({
  [ROLES.CASHIER]: 1,
  [ROLES.MANAGER]: 2,
  [ROLES.OWNER]: 3
});

const PERMISSIONS = Object.freeze({
  'pos.checkout': [ROLES.CASHIER, ROLES.MANAGER, ROLES.OWNER],
  'pos.hold_bill': [ROLES.CASHIER, ROLES.MANAGER, ROLES.OWNER],
  'shifts.manage_own': [ROLES.CASHIER, ROLES.MANAGER, ROLES.OWNER],
  'products.view': [ROLES.CASHIER, ROLES.MANAGER, ROLES.OWNER],
  'products.manage': [ROLES.MANAGER, ROLES.OWNER],
  'stock.opname': [ROLES.MANAGER, ROLES.OWNER],
  'orders.void': [ROLES.MANAGER, ROLES.OWNER],
  'orders.return': [ROLES.MANAGER, ROLES.OWNER],
  'reconcile.manage': [ROLES.MANAGER, ROLES.OWNER],
  'reports.view': [ROLES.MANAGER, ROLES.OWNER],
  'audit.view': [ROLES.MANAGER, ROLES.OWNER],
  'settings.manage': [ROLES.OWNER],
  'users.manage': [ROLES.OWNER]
});

function isValidRole(role) {
  return Object.prototype.hasOwnProperty.call(ROLE_LEVELS, role);
}

function isAtLeast(role, minimumRole) {
  return isValidRole(role) && isValidRole(minimumRole) && ROLE_LEVELS[role] >= ROLE_LEVELS[minimumRole];
}

function can(role, permission) {
  const allowedRoles = PERMISSIONS[permission];
  return Array.isArray(allowedRoles) && allowedRoles.includes(role);
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Harap masuk terlebih dahulu' });
    }

    if (!can(req.user.role, permission)) {
      return res.status(403).json({
        error: 'Akses ditolak: peran Anda tidak memiliki izin untuk tindakan ini'
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
  ROLE_LEVELS,
  PERMISSIONS,
  isValidRole,
  isAtLeast,
  can,
  requirePermission,
  requireMinimumRole
};
