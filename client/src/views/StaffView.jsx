import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  UserCog,
  Plus,
  Search,
  Pencil,
  Trash2,
  Lock,
  Unlock,
  KeyRound,
  Store,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Users,
  ShieldCheck,
  Eye,
  EyeOff,
  RefreshCw,
  MailCheck
} from 'lucide-react';
import { apiRequest } from '../api';
import { useSession } from '../context/SessionContext';
import Modal from '../components/Modal';

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const PIN_PATTERN = /^\d{6}$/;

const ROLE_STYLES = {
  owner: 'bg-purple-100 text-purple-700 border-purple-200',
  manager: 'bg-blue-100 text-blue-700 border-blue-200',
  cashier: 'bg-emerald-100 text-emerald-700 border-emerald-200'
};

const ROLE_LABELS = {
  owner: 'Owner',
  manager: 'Manajer',
  cashier: 'Kasir'
};

function requiresPin(role) {
  return role === 'owner' || role === 'manager';
}

function buildEmptyForm(outlets) {
  const firstActive = outlets.find((outlet) => outlet.is_active) || outlets[0] || null;
  return {
    username: '',
    full_name: '',
    password: '',
    role: 'cashier',
    pin: '',
    clear_pin: false,
    is_locked: false,
    outlet_ids: firstActive ? [firstActive.id] : [],
    primary_outlet_id: firstActive ? firstActive.id : null
  };
}

function buildFormFromUser(target) {
  const granted = (target.outlets || []).filter((outlet) => outlet.is_active !== false);
  let outletIds = granted.map((outlet) => outlet.id);
  if (outletIds.length === 0 && target.outlet_id) outletIds = [target.outlet_id];

  const grantedPrimary = granted.find((outlet) => outlet.is_primary);
  const primary = grantedPrimary?.id
    || (outletIds.includes(target.outlet_id) ? target.outlet_id : outletIds[0])
    || null;

  return {
    username: target.username || '',
    full_name: target.full_name || '',
    password: '',
    role: target.role || 'cashier',
    pin: '',
    clear_pin: false,
    is_locked: Boolean(target.is_locked),
    outlet_ids: outletIds,
    primary_outlet_id: primary
  };
}

function validateForm(form, { isEdit, existingHasPin, currentUserId, editingUserId }) {
  const errors = [];

  if (!form.full_name.trim() || form.full_name.trim().length < 2 || form.full_name.trim().length > 100) {
    errors.push('Nama lengkap wajib diisi (2-100 karakter)');
  }

  if (!isEdit && !USERNAME_PATTERN.test(form.username.trim().toLowerCase())) {
    errors.push('Username harus 3-32 karakter (huruf kecil, angka, titik, garis bawah, atau strip)');
  }

  if (!isEdit && (!form.password || form.password.length < 8 || form.password.length > 128)) {
    errors.push('Password wajib diisi 8-128 karakter');
  }
  if (isEdit && form.password && (form.password.length < 8 || form.password.length > 128)) {
    errors.push('Password baru harus 8-128 karakter');
  }

  if (!['owner', 'manager', 'cashier'].includes(form.role)) {
    errors.push('Peran tidak valid');
  }

  if (requiresPin(form.role)) {
    if (form.clear_pin) {
      errors.push('PIN Manajer wajib dimiliki oleh peran manager atau owner');
    } else if (form.pin && !PIN_PATTERN.test(form.pin)) {
      errors.push('PIN harus tepat 6 digit angka');
    } else if (!isEdit && !PIN_PATTERN.test(form.pin)) {
      errors.push('PIN Manajer wajib diisi 6 digit angka');
    } else if (isEdit && !existingHasPin && !PIN_PATTERN.test(form.pin)) {
      errors.push('PIN Manajer wajib diisi 6 digit angka');
    }
  } else if (form.pin && !PIN_PATTERN.test(form.pin)) {
    errors.push('PIN harus tepat 6 digit angka');
  }

  if (form.outlet_ids.length === 0) {
    errors.push('Pilih minimal satu outlet yang diotorisasi');
  }
  if (!form.primary_outlet_id || !form.outlet_ids.includes(form.primary_outlet_id)) {
    errors.push('Outlet utama harus termasuk dalam daftar outlet yang diotorisasi');
  }

  if (isEdit && form.is_locked && editingUserId === currentUserId) {
    errors.push('Anda tidak dapat mengunci akun sendiri');
  }

  return errors;
}

function RoleBadge({ role }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${ROLE_STYLES[role] || ROLE_STYLES.cashier}`}>
      <ShieldCheck className="w-3 h-3" />
      {ROLE_LABELS[role] || role}
    </span>
  );
}

export default function StaffView() {
  const { user: currentUser, activeOutletId } = useSession();
  const [users, setUsers] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [roles, setRoles] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(buildEmptyForm([]));
  const [formErrors, setFormErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setLoadError('');
    try {
      const [usersRes, outletsRes, rolesRes] = await Promise.all([
        apiRequest('/users'),
        apiRequest('/outlets'),
        apiRequest('/roles').catch(() => ({ roles: [] }))
      ]);

      setUsers(usersRes.users || []);
      setCanManage(Boolean(usersRes.can_manage));
      setOutlets((outletsRes.outlets || []).filter((outlet) => outlet.is_active !== false));
      setRoles(rolesRes.roles || []);
    } catch (error) {
      setLoadError(error.message || 'Gagal memuat data staf');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return users.filter((staff) => {
      if (roleFilter !== 'all' && staff.role !== roleFilter) return false;
      if (!keyword) return true;
      return (
        (staff.full_name || '').toLowerCase().includes(keyword)
        || (staff.username || '').toLowerCase().includes(keyword)
        || (staff.outlets || []).some((outlet) => (outlet.name || '').toLowerCase().includes(keyword))
      );
    });
  }, [users, search, roleFilter]);

  const stats = useMemo(() => ({
    total: users.length,
    owners: users.filter((staff) => staff.role === 'owner').length,
    managers: users.filter((staff) => staff.role === 'manager').length,
    locked: users.filter((staff) => staff.is_locked).length
  }), [users]);

  const openAddModal = () => {
    setEditingUser(null);
    setForm(buildEmptyForm(outlets));
    setFormErrors([]);
    setShowPassword(false);
    setShowPin(false);
    setModalOpen(true);
  };

  const openEditModal = (staff) => {
    setEditingUser(staff);
    setForm(buildFormFromUser(staff));
    setFormErrors([]);
    setShowPassword(false);
    setShowPin(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingUser(null);
    setFormErrors([]);
  };

  const toggleOutlet = (outletId) => {
    setForm((previous) => {
      const has = previous.outlet_ids.includes(outletId);
      const nextIds = has
        ? previous.outlet_ids.filter((id) => id !== outletId)
        : [...previous.outlet_ids, outletId];

      let primary = previous.primary_outlet_id;
      if (has && primary === outletId) primary = nextIds[0] || null;
      if (!has && !primary) primary = outletId;

      return { ...previous, outlet_ids: nextIds, primary_outlet_id: primary };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const isEdit = Boolean(editingUser);
    const errors = validateForm(form, {
      isEdit,
      existingHasPin: Boolean(editingUser?.has_pin),
      currentUserId: currentUser?.id,
      editingUserId: editingUser?.id
    });

    if (errors.length) {
      setFormErrors(errors);
      return;
    }

    setSaving(true);
    setFormErrors([]);
    try {
      if (isEdit) {
        const payload = {
          full_name: form.full_name.trim(),
          role: form.role,
          outlet_ids: form.outlet_ids,
          primary_outlet_id: form.primary_outlet_id,
          is_locked: form.is_locked
        };
        if (form.password) payload.password = form.password;
        if (form.pin) payload.pin = form.pin;
        if (form.clear_pin) payload.clear_pin = true;

        await apiRequest(`/users/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        setNotice({ type: 'success', message: `Akun ${form.full_name.trim()} berhasil diperbarui` });
      } else {
        const payload = {
          username: form.username.trim().toLowerCase(),
          full_name: form.full_name.trim(),
          role: form.role,
          password: form.password,
          outlet_ids: form.outlet_ids,
          primary_outlet_id: form.primary_outlet_id
        };
        if (form.pin) payload.pin = form.pin;

        await apiRequest('/users', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setNotice({ type: 'success', message: `Akun staf ${form.full_name.trim()} berhasil dibuat` });
      }

      setModalOpen(false);
      setEditingUser(null);
      await loadData({ silent: true });
    } catch (error) {
      const details = Array.isArray(error.details) && error.details.length ? error.details : null;
      setFormErrors(details || [error.message || 'Gagal menyimpan akun staf']);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLock = async (staff) => {
    if (!canManage) return;
    if (staff.id === currentUser?.id) {
      setNotice({ type: 'error', message: 'Anda tidak dapat mengunci akun sendiri' });
      return;
    }

    const nextLocked = !staff.is_locked;
    const confirmed = window.confirm(
      nextLocked
        ? `Kunci akun ${staff.full_name}? Staf tidak dapat masuk sampai dibuka kembali.`
        : `Buka kunci akun ${staff.full_name}?`
    );
    if (!confirmed) return;

    setBusyId(staff.id);
    try {
      await apiRequest(`/users/${staff.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_locked: nextLocked })
      });
      setNotice({
        type: 'success',
        message: `Akun ${staff.full_name} ${nextLocked ? 'dikunci' : 'dibuka'}`
      });
      await loadData({ silent: true });
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'Gagal mengubah status akun' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (staff) => {
    if (!canManage) return;
    if (staff.id === currentUser?.id) {
      setNotice({ type: 'error', message: 'Anda tidak dapat menghapus akun sendiri' });
      return;
    }

    const confirmed = window.confirm(
      `Hapus akun ${staff.full_name} (@${staff.username}) secara permanen? Tindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmed) return;

    setBusyId(staff.id);
    try {
      await apiRequest(`/users/${staff.id}`, { method: 'DELETE' });
      setNotice({ type: 'success', message: `Akun ${staff.full_name} berhasil dihapus` });
      await loadData({ silent: true });
    } catch (error) {
      setNotice({
        type: 'error',
        message: error.code === 'USER_HAS_HISTORY'
          ? 'Akun memiliki riwayat transaksi atau shift. Kunci akun alih-alih menghapusnya.'
          : (error.message || 'Gagal menghapus akun staf')
      });
    } finally {
      setBusyId(null);
    }
  };

  const roleOptions = roles.length
    ? roles.map((role) => ({ id: role.id, label: role.label }))
    : Object.keys(ROLE_LABELS).map((id) => ({ id, label: ROLE_LABELS[id] }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <UserCog className="w-6 h-6 text-brand-600" />
            <span>Manajemen Staf</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Kelola akun kasir dan manajer, peran, PIN otorisasi, serta outlet yang boleh diakses.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadData()}
            disabled={loading}
            title="Muat ulang"
            className="p-2.5 rounded-xl border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canManage && (
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-sm shadow-brand-500/20 transition"
            >
              <Plus className="w-4 h-4" />
              Tambah Staf
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div
          className={`mb-4 flex items-start gap-2 p-3 rounded-xl border text-xs ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {notice.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{notice.message}</span>
        </div>
      )}

      {!canManage && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <Lock className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Anda dapat melihat staf pada outlet yang diotorisasi, tetapi hanya Owner yang boleh membuat,
            mengubah, atau menghapus akun.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total Staf</p>
          <p className="text-lg font-bold text-slate-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Owner</p>
          <p className="text-lg font-bold text-purple-700">{stats.owners}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Manajer</p>
          <p className="text-lg font-bold text-blue-700">{stats.managers}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Terkunci</p>
          <p className="text-lg font-bold text-rose-600">{stats.locked}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama, username, atau outlet..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">Semua peran</option>
            {roleOptions.map((role) => (
              <option key={role.id} value={role.id}>{role.label}</option>
            ))}
          </select>
        </div>

        {loadError && (
          <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{loadError}</span>
          </div>
        )}

        {loading ? (
          <div className="p-10 flex flex-col items-center gap-2 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-xs">Memuat data staf...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="w-10 h-10 mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">
              {users.length === 0 ? 'Belum ada akun staf' : 'Tidak ada staf yang cocok'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {users.length === 0
                ? 'Tambahkan akun kasir atau manajer untuk mulai beroperasi.'
                : 'Coba ubah kata kunci atau filter peran.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide text-[10px]">
                <tr>
                  <th className="px-4 py-3 font-bold">Staf</th>
                  <th className="px-4 py-3 font-bold">Peran</th>
                  <th className="px-4 py-3 font-bold">Outlet Diotorisasi</th>
                  <th className="px-4 py-3 font-bold">PIN</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((staff) => {
                  const isSelf = staff.id === currentUser?.id;
                  const isBusy = busyId === staff.id;
                  const staffOutlets = staff.outlets || [];
                  return (
                    <tr key={staff.id} className={isSelf ? 'bg-brand-50/40' : 'hover:bg-slate-50/60'}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                            staff.is_locked ? 'bg-slate-200 text-slate-500' : 'bg-brand-100 text-brand-700'
                          }`}>
                            {(staff.full_name || '?').slice(0, 1).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-800 truncate max-w-[200px]">
                                {staff.full_name}
                              </span>
                              {isSelf && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-600 text-white">
                                  ANDA
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-slate-400">@{staff.username}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={staff.role} />
                      </td>
                      <td className="px-4 py-3">
                        {staffOutlets.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                            <AlertTriangle className="w-3 h-3" /> Belum diotorisasi
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-[280px]">
                            {staffOutlets.map((outlet) => (
                              <span
                                key={outlet.id}
                                title={outlet.is_primary ? 'Outlet utama' : 'Outlet diotorisasi'}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                                  outlet.is_primary
                                    ? 'bg-brand-100 text-brand-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                <Store className="w-3 h-3" />
                                {outlet.code}
                                {outlet.is_primary && <span className="text-[8px]">★</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                          staff.has_pin ? 'text-emerald-600' : 'text-slate-400'
                        }`}>
                          <KeyRound className="w-3 h-3" />
                          {staff.has_pin ? 'Terpasang' : 'Tidak ada'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          staff.is_locked
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${staff.is_locked ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                          {staff.is_locked ? 'Terkunci' : 'Aktif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {canManage ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(staff)}
                                disabled={isBusy}
                                title="Edit staf"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-40 transition"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleLock(staff)}
                                disabled={isBusy || isSelf}
                                title={staff.is_locked ? 'Buka kunci akun' : 'Kunci akun'}
                                className={`p-1.5 rounded-lg disabled:opacity-40 transition ${
                                  staff.is_locked
                                    ? 'text-emerald-600 hover:bg-emerald-50'
                                    : 'text-amber-600 hover:bg-amber-50'
                                }`}
                              >
                                {isBusy
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : staff.is_locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(staff)}
                                disabled={isBusy || isSelf}
                                title="Hapus akun"
                                className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-400">Hanya lihat</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-400">
        <MailCheck className="w-3.5 h-3.5" />
        Password dan PIN disimpan sebagai hash bcrypt dan tidak pernah dikirim kembali ke browser.
        {activeOutletId ? ` Outlet aktif saat ini: #${activeOutletId}.` : ''}
      </p>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingUser ? `Edit Staf: ${editingUser.full_name}` : 'Tambah Staf Baru'}
        subtitle={
          editingUser
            ? 'Perbarui peran, PIN, atau outlet yang diotorisasi. Kosongkan password/PIN untuk mempertahankan nilai lama.'
            : 'Buat akun login baru dengan peran, PIN otorisasi, dan outlet yang diizinkan.'
        }
        icon={UserCog}
        size="lg"
        closeOnBackdrop={!saving}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              form="staff-form"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50 transition"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Menyimpan...' : (editingUser ? 'Simpan Perubahan' : 'Buat Akun')}
            </button>
          </div>
        }
      >
        <form id="staff-form" onSubmit={handleSubmit} className="space-y-4">
          {formErrors.length > 0 && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <div className="flex items-center gap-1.5 font-semibold mb-1">
                <AlertTriangle className="w-4 h-4" />
                Periksa kembali data staf
              </div>
              <ul className="list-disc pl-5 space-y-0.5">
                {formErrors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap *</label>
              <input
                type="text"
                required
                maxLength={100}
                value={form.full_name}
                onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                placeholder="Contoh: Siti Rahmawati"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Username *</label>
              <input
                type="text"
                required
                maxLength={32}
                disabled={Boolean(editingUser)}
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })}
                placeholder="contoh: siti.rahma"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                {editingUser ? 'Username tidak dapat diubah setelah akun dibuat.' : '3-32 karakter: huruf kecil, angka, titik, garis bawah, strip.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {editingUser ? 'Password Baru (opsional)' : 'Password *'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required={!editingUser}
                  minLength={8}
                  maxLength={128}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder={editingUser ? 'Kosongkan jika tidak diubah' : 'Minimal 8 karakter'}
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((previous) => !previous)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Peran *</label>
              <select
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value })}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
              >
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.id}>{role.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                Peran menentukan izin. Atur detail izin di menu Peran &amp; Matriks Izin.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                PIN Otorisasi {requiresPin(form.role) ? '*' : '(opsional)'}
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={6}
                  value={form.pin}
                  disabled={form.clear_pin}
                  onChange={(event) => setForm({
                    ...form,
                    pin: event.target.value.replace(/\D/g, '').slice(0, 6)
                  })}
                  placeholder={editingUser?.has_pin ? 'Kosongkan jika tetap' : '6 digit angka'}
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((previous) => !previous)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600"
                  aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                PIN 6 digit dipakai untuk otorisasi void, retur, dan stock opname.
              </p>
            </div>

            <div className="flex flex-col justify-end gap-2">
              {editingUser && editingUser.has_pin && (
                <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.clear_pin}
                    onChange={(event) => setForm({
                      ...form,
                      clear_pin: event.target.checked,
                      pin: event.target.checked ? '' : form.pin
                    })}
                    className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                  />
                  Hapus PIN yang tersimpan
                </label>
              )}
              {editingUser && (
                <label className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-xs cursor-pointer ${
                  editingUser.id === currentUser?.id
                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-50 border-slate-300 text-slate-700'
                }`}>
                  <input
                    type="checkbox"
                    checked={form.is_locked}
                    disabled={editingUser.id === currentUser?.id}
                    onChange={(event) => setForm({ ...form, is_locked: event.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                  />
                  Kunci akun (tidak dapat login)
                </label>
              )}
            </div>
          </div>

          <div className="pt-1">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-700">
                Outlet Diotorisasi *
              </label>
              <span className="text-[10px] text-slate-400">
                Tandai satu outlet sebagai outlet utama
              </span>
            </div>

            {outlets.length === 0 ? (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Belum ada outlet aktif. Tambahkan outlet terlebih dahulu di menu Outlet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {outlets.map((outlet) => {
                  const checked = form.outlet_ids.includes(outlet.id);
                  const isPrimary = form.primary_outlet_id === outlet.id;
                  return (
                    <div
                      key={outlet.id}
                      className={`flex items-start gap-2 p-3 rounded-xl border transition ${
                        checked
                          ? 'bg-brand-50/60 border-brand-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOutlet(outlet.id)}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800 truncate">{outlet.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{outlet.code}</p>
                        {checked && (
                          <label className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-600 cursor-pointer">
                            <input
                              type="radio"
                              name="primary-outlet"
                              checked={isPrimary}
                              onChange={() => setForm({ ...form, primary_outlet_id: outlet.id })}
                              className="w-3 h-3 text-brand-600 focus:ring-brand-500"
                            />
                            Outlet utama
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
