'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken, recordAuditLog } = require('../auth');
const {
  can,
  getPermissionMatrix,
  getPermissionCatalog,
  getRoleCatalog,
  savePermissionMatrix,
  requirePermission,
  PERMISSION_CATALOG,
  LOCKED_PERMISSIONS
} = require('../services/rbac');

// GET /api/roles - role catalog plus the permission matrix
router.get('/', authenticateToken, requirePermission('users.view'), async (req, res) => {
  try {
    const canViewMatrix = can(req.user.role, 'roles.view');
    res.json({
      roles: getRoleCatalog(),
      catalog: getPermissionCatalog(),
      matrix: canViewMatrix ? getPermissionMatrix() : null,
      can_manage: can(req.user.role, 'roles.manage'),
      locked_permissions: [...LOCKED_PERMISSIONS]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/roles/permissions - replace permission assignments (owner only)
router.put('/permissions', authenticateToken, requirePermission('roles.manage'), async (req, res) => {
  try {
    const incoming = req.body && req.body.permissions !== undefined
      ? req.body.permissions
      : req.body;

    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return res.status(400).json({
        error: 'Body harus berisi objek permissions',
        code: 'INVALID_PERMISSION_MATRIX'
      });
    }

    const before = getPermissionMatrix();
    const matrix = await savePermissionMatrix(incoming);

    await recordAuditLog(
      req.user.id,
      'UPDATE_RBAC_MATRIX',
      'roles',
      'permission_matrix',
      {
        changed: Object.keys(incoming).filter((permission) => {
          const previous = before[permission] || [];
          const next = matrix[permission] || [];
          return previous.length !== next.length || previous.some((role) => !next.includes(role));
        })
      },
      req
    );

    res.json({
      matrix,
      roles: getRoleCatalog(),
      catalog: getPermissionCatalog(),
      message: 'Matriks izin berhasil diperbarui'
    });
  } catch (err) {
    if (err.code === 'INVALID_PERMISSION_MATRIX' || err.statusCode === 400) {
      return res.status(400).json({ error: err.message, code: 'INVALID_PERMISSION_MATRIX' });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/roles/catalog - raw permission catalog (used by the matrix editor)
router.get('/catalog', authenticateToken, requirePermission('roles.view'), async (req, res) => {
  res.json({
    catalog: getPermissionCatalog(),
    locked_permissions: [...LOCKED_PERMISSIONS],
    permission_keys: PERMISSION_CATALOG.map((entry) => entry.key)
  });
});

module.exports = router;
