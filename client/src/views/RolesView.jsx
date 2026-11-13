import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  Save,
  RotateCcw,
  Lock,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Users,
  Info,
  KeyRound,
  ShieldAlert
} from 'lucide-react';
import { apiRequest } from '../api';
import { useSession } from '../context/SessionContext';

const ROLE_ACCENTS = {
  owner: {
    header: 'bg-purple-50 text-purple-700 border-purple-200',
    chip: 'bg-purple-100 text-purple-700',
    checkbox: 'text-purple-600 focus:ring-purple-500'
  },
  manager: {
    header: 'bg-blue-50 text-blue-700 border-blue-200',
    chip: 'bg-blue-100 text-blue-700',
    checkbox: 'text-blue-600 focus:ring-blue-500'
  },
  cashier: {
    header: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    chip: 'bg-emerald-100 text-emerald-700',
    checkbox: 'text-emerald-600 focus:ring-emerald-500'
  }
};

const ROLE_DESCRIPTIONS = {
  owner: 'Akses penuh termasuk administrasi, staf, dan matriks izin.',
  manager: 'Operasional toko: inventori, rekonsiliasi, laporan, dan pengawasan staf.',
  cashier: 'Transaksi harian: checkout, hold bill, shift, dan pelanggan.'
};

function cloneMatrix(matrix) {
  const result = {};
  Object.keys(matrix || {}).forEach((permission) => {
    result[permission] = [...matrix[permission]];
  });
  return result;
}

function sortRoles(roles) {
  return [...roles].sort((a, b) => (b.level || 0) - (a.level || 0));
}

function RoleSummaryCard({ role, permissionCount, totalPermissions, isDirty }) {
  const accent = ROLE_ACCENTS[role.id] || ROLE_ACCENTS.cashier;
  const percentage = totalPermissions > 0 ? Math.round((permissionCount / totalPermissions) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${accent.header}`}>
          {role.label}
        </div>
        {isDirty && (
          <span className="text-[9px] font-bold uppercase text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
            Berubah
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900 leading-none">
        {permissionCount}
        <span className="text-xs font-medium text-slate-400"> / {totalPermissions} izin</span>
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] text-slate-500 leading-snug">
        {ROLE_DESCRIPTIONS[role.id] || 'Peran khusus'}
      </p>
    </div>
  );
}

export default function RolesView() {
  const { user } = useSession();
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [matrix, setMatrix] = useState(null);
  const [draft, setDraft] = useState({});
  const [lockedPermissions, setLockedPermissions] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await apiRequest('/roles');
      const serverMatrix = response.matrix || null;
      setRoles(sortRoles(response.roles || []));
      setCatalog(response.catalog || []);
      setMatrix(serverMatrix);
      setDraft(cloneMatrix(serverMatrix));
      setLockedPermissions(response.locked_permissions || []);
      setCanManage(Boolean(response.can_manage));
    } catch (error) {
      setLoadError(error.message || 'Gagal memuat matriks izin');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const groupedCatalog = useMemo(() => {
    const groups = new Map();
    catalog.forEach((entry) => {
      if (!groups.has(entry.group)) groups.set(entry.group, []);
      groups.get(entry.group).push(entry);
    });
    return [...groups.entries()].map(([group, permissions]) => ({ group, permissions }));
  }, [catalog]);

  const dirty = useMemo(
    () => Boolean(matrix) && JSON.stringify(draft) !== JSON.stringify(matrix),
    [draft, matrix]
  );

  const permissionCountForRole = useCallback(
    (roleId) => {
      if (!matrix) {
        return (roles.find((role) => role.id === roleId)?.permissions || []).length;
      }
      return catalog.reduce(
        (total, entry) => total + ((draft[entry.key] || []).includes(roleId) ? 1 : 0),
        0
      );
    },
    [catalog, draft, matrix, roles]
  );

  const roleIsDirty = useCallback(
    (roleId) => {
      if (!matrix) return false;
      return catalog.some((entry) => {
        const before = (matrix[entry.key] || []).includes(roleId);
        const after = (draft[entry.key] || []).includes(roleId);
        return before !== after;
      });
    },
    [catalog, draft, matrix]
  );

  const handleToggle = (permissionEntry, roleId) => {
    if (!canManage || !matrix) return;

    const isLockedCell = roleId === 'owner' && lockedPermissions.includes(permissionEntry.key);
    if (isLockedCell) return;

    setDraft((previous) => {
      const current = previous[permissionEntry.key] || [];
      const hasRole = current.includes(roleId);

      if (hasRole) {
        if (current.length === 1) {
          setNotice({
            type: 'error',
            message: `Izin "${permissionEntry.label}" harus dimiliki minimal satu peran.`
          });
          return previous;
        }
        return { ...previous, [permissionEntry.key]: current.filter((role) => role !== roleId) };
      }

      return { ...previous, [permissionEntry.key]: [...current, roleId] };
    });
  };

  const handleReset = () => {
    if (!matrix) return;
    setDraft(cloneMatrix(matrix));
    setNotice({ type: 'info', message: 'Perubahan lokal dibatalkan. Matriks kembali ke versi tersimpan.' });
  };

  const handleSave = async () => {
    if (!canManage || !matrix) return;

    setSaving(true);
    setNotice(null);
    try {
      const response = await apiRequest('/roles/permissions', {
        method: 'PUT',
        body: JSON.stringify({ permissions: draft })
      });

      const serverMatrix = response.matrix || draft;
      setMatrix(cloneMatrix(serverMatrix));
      setDraft(cloneMatrix(serverMatrix));
      if (response.roles) setRoles(sortRoles(response.roles));
      if (response.catalog) setCatalog(response.catalog);

      setNotice({
        type: 'success',
        message: 'Matriks izin berhasil disimpan. Perubahan berlaku pada sesi berikutnya setelah pengguna masuk kembali.'
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: error.code === 'INVALID_PERMISSION_MATRIX'
          ? (error.message || 'Matriks izin tidak valid')
          : (error.message || 'Gagal menyimpan matriks izin')
      });
    } finally {
      setSaving(false);
    }
  };

  const totalPermissions = catalog.length;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 flex flex-col items-center gap-2 text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin" />
        <p className="text-xs">Memuat matriks izin...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-brand-600" />
            <span>Peran &amp; Matriks Izin</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Tentukan tindakan yang boleh dilakukan setiap peran. Perubahan hanya dapat disimpan oleh Owner.
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40 transition"
            >
              <RotateCcw className="w-4 h-4" />
              Batalkan
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-sm shadow-brand-500/20 disabled:opacity-40 transition"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div
          className={`mb-4 flex items-start gap-2 p-3 rounded-xl border text-xs ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : notice.type === 'info'
                ? 'bg-brand-50 border-brand-200 text-brand-700'
                : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {notice.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
          {notice.type === 'info' && <Info className="w-4 h-4 shrink-0 mt-0.5" />}
          {notice.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{notice.message}</span>
        </div>
      )}

      {loadError && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>{loadError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {roles.map((role) => (
          <RoleSummaryCard
            key={role.id}
            role={role}
            permissionCount={permissionCountForRole(role.id)}
            totalPermissions={totalPermissions}
            isDirty={roleIsDirty(role.id)}
          />
        ))}
      </div>

      {!matrix ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
          <ShieldAlert className="w-10 h-10 mx-auto text-amber-400" />
          <p className="mt-3 text-sm font-semibold text-slate-800">Matriks izin tidak tersedia</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Akun Anda ({user?.role || 'staf'}) dapat melihat daftar peran, tetapi hanya Owner yang boleh
            melihat dan mengubah pemetaan izin.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {roles.map((role) => (
              <span
                key={role.id}
                className={`px-2 py-1 rounded-full text-[10px] font-bold ${(ROLE_ACCENTS[role.id] || ROLE_ACCENTS.cashier).chip}`}
              >
                {role.label} • {(role.permissions || []).length} izin
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-start gap-2 bg-slate-50/70">
            <KeyRound className="w-4 h-4 text-slate-400 mt-0.5" />
            <p className="text-[11px] text-slate-500 leading-snug">
              Centang tindakan yang diizinkan untuk tiap peran. Izin <strong>users.manage</strong>,{' '}
              <strong>roles.manage</strong>, dan <strong>settings.manage</strong> dikunci pada Owner untuk
              mencegah sistem terkunci permanen. Setiap izin wajib dimiliki minimal satu peran.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[760px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold uppercase tracking-wide text-[10px] sticky left-0 bg-slate-50 z-10 min-w-[280px]">
                    Izin
                  </th>
                  {roles.map((role) => (
                    <th key={role.id} className="px-4 py-3 text-center min-w-[120px]">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${(ROLE_ACCENTS[role.id] || ROLE_ACCENTS.cashier).header}`}>
                        {role.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedCatalog.map(({ group, permissions }) => (
                  <React.Fragment key={group}>
                    <tr className="bg-slate-100/80">
                      <td colSpan={roles.length + 1} className="px-4 py-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {group}
                        </span>
                      </td>
                    </tr>
                    {permissions.map((entry) => {
                      const assignedRoles = draft[entry.key] || [];
                      const isLockedOwner = lockedPermissions.includes(entry.key);
                      return (
                        <tr key={entry.key} className="border-t border-slate-100 hover:bg-slate-50/60">
                          <td className="px-4 py-3 align-top sticky left-0 bg-white">
                            <div className="flex items-start gap-2">
                              <code className="mt-0.5 text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                                {entry.key}
                              </code>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 leading-tight">{entry.label}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{entry.description}</p>
                              </div>
                            </div>
                          </td>
                          {roles.map((role) => {
                            const checked = assignedRoles.includes(role.id);
                            const lockedCell = role.id === 'owner' && isLockedOwner;
                            const accent = ROLE_ACCENTS[role.id] || ROLE_ACCENTS.cashier;
                            return (
                              <td key={role.id} className="px-4 py-3 text-center align-middle">
                                <label
                                  className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border transition ${
                                    lockedCell
                                      ? 'bg-amber-50 border-amber-200 cursor-not-allowed text-amber-600'
                                      : checked
                                        ? 'bg-brand-50 border-brand-200 cursor-pointer'
                                        : 'bg-white border-slate-200 cursor-pointer hover:border-slate-300'
                                  } ${!canManage ? 'opacity-60 cursor-not-allowed' : ''}`}
                                  title={
                                    lockedCell
                                      ? 'Izin ini wajib dimiliki Owner'
                                      : checked ? 'Klik untuk mencabut izin' : 'Klik untuk memberi izin'
                                  }
                                >
                                  <input
                                    type="checkbox"
                                    className={`sr-only ${accent.checkbox}`}
                                    checked={checked}
                                    disabled={!canManage || lockedCell}
                                    onChange={() => handleToggle(entry, role.id)}
                                  />
                                  {lockedCell ? (
                                    <Lock className="w-3.5 h-3.5" />
                                  ) : checked ? (
                                    <CheckCircle2 className="w-4 h-4 text-brand-600" />
                                  ) : (
                                    <span className="w-3.5 h-3.5 rounded-full border border-slate-300" />
                                  )}
                                </label>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-400">
        <Users className="w-3.5 h-3.5" />
        Izin UI hanya menyembunyikan kontrol. Server tetap memvalidasi setiap permintaan API.
      </p>
    </div>
  );
}
