// Client-side mirror of the default RBAC matrix. The server is authoritative
// and returns `user.permissions` in the session payload; this fallback keeps
// cached sessions from older clients usable and documents the permission keys.

export const ROLE_LABELS = {
  cashier: 'Kasir',
  manager: 'Manajer',
  owner: 'Owner'
};

export const DEFAULT_ROLE_PERMISSIONS = {
  'pos.checkout': ['cashier', 'manager', 'owner'],
  'pos.hold_bill': ['cashier', 'manager', 'owner'],
  'shifts.manage_own': ['cashier', 'manager', 'owner'],
  'qris.view': ['cashier', 'manager', 'owner'],
  'customers.view': ['cashier', 'manager', 'owner'],
  'products.view': ['cashier', 'manager', 'owner'],
  'products.manage': ['manager', 'owner'],
  'stock.opname': ['manager', 'owner'],
  'orders.void': ['manager', 'owner'],
  'orders.return': ['manager', 'owner'],
  'reconcile.manage': ['manager', 'owner'],
  'reports.view': ['manager', 'owner'],
  'audit.view': ['manager', 'owner'],
  'outlets.view': ['manager', 'owner'],
  'outlets.manage': ['owner'],
  'users.view': ['manager', 'owner'],
  'users.manage': ['owner'],
  'roles.view': ['owner'],
  'roles.manage': ['owner'],
  'settings.manage': ['owner']
};

export function permissionsForRole(role) {
  return Object.keys(DEFAULT_ROLE_PERMISSIONS).filter((permission) =>
    DEFAULT_ROLE_PERMISSIONS[permission].includes(role)
  );
}

/**
 * Prefers the permissions resolved by the server. Falls back to the default
 * matrix only for cached sessions created before permissions were exposed.
 */
export function resolvePermissions(user) {
  if (!user) return [];
  if (Array.isArray(user.permissions)) return user.permissions;
  return permissionsForRole(user.role);
}
