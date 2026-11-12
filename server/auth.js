const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'pos-qris-super-secret-key-2026';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      outlet_id: user.outlet_id
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Akses ditolak: token tidak ditemukan' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Sesi kedaluwarsa atau token tidak valid' });
    }
    req.user = user;
    next();
  });
}

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Harap masuk terlebih dahulu' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Akses ditolak: Dibutuhkan peran ${allowedRoles.join(' atau ')}` 
      });
    }
    next();
  };
}

async function verifyManagerPin(req, res, next) {
  const managerPin = req.headers['x-manager-pin'] || req.body.manager_pin;

  if (!managerPin) {
    return res.status(403).json({ 
      error: 'PIN Manajer diperlukan untuk melakukan tindakan otorisasi ini' 
    });
  }

  // Look for any manager or owner with active status in the outlet
  const managers = await db.allAsync(
    `SELECT id, username, full_name, pin_hash, failed_pin_attempts, is_locked 
     FROM users 
     WHERE role IN ('manager', 'owner')`
  );

  let verifiedManager = null;
  let lockedManager = false;

  for (const mgr of managers) {
    if (mgr.is_locked) {
      lockedManager = true;
      continue;
    }

    if (mgr.pin_hash && bcrypt.compareSync(String(managerPin), mgr.pin_hash)) {
      verifiedManager = mgr;
      // Reset failed attempts on success
      await db.runAsync('UPDATE users SET failed_pin_attempts = 0 WHERE id = ?', [mgr.id]);
      break;
    }
  }

  if (!verifiedManager) {
    // Increment failed pin attempts on all managers
    await db.runAsync(
      `UPDATE users 
       SET failed_pin_attempts = failed_pin_attempts + 1, 
           is_locked = CASE WHEN failed_pin_attempts + 1 >= 5 THEN 1 ELSE 0 END 
       WHERE role IN ('manager', 'owner')`
    );

    return res.status(401).json({ 
      error: 'PIN Manajer salah. Otorisasi gagal. (PIN akan terkunci jika 5 kali salah berturut-turut)' 
    });
  }

  req.manager = verifiedManager;
  next();
}

async function recordAuditLog(userId, action, entity, entityId, details, req) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1') : 'system';
    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip_address) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        action,
        entity,
        String(entityId || ''),
        typeof details === 'object' ? JSON.stringify(details) : String(details || ''),
        ip
      ]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = {
  JWT_SECRET,
  generateToken,
  authenticateToken,
  requireRole,
  verifyManagerPin,
  recordAuditLog
};
