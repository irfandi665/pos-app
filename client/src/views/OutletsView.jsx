import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Store,
  Plus,
  Search,
  Pencil,
  Trash2,
  Power,
  MapPin,
  Phone,
  Clock,
  Users,
  Package,
  ReceiptText,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Building2,
  RefreshCw
} from 'lucide-react';
import { apiRequest } from '../api';
import { useSession } from '../context/SessionContext';
import RequirePermission from '../components/RequirePermission';
import Modal from '../components/Modal';

const OUTLET_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,19}$/;
const TIMEZONE_OPTIONS = [
  'Asia/Jakarta',
  'Asia/Pontianak',
  'Asia/Makassar',
  'Asia/Jayapura',
  'Asia/Singapore'
];

function emptyForm() {
  return {
    name: '',
    code: '',
    address: '',
    phone: '',
    timezone: 'Asia/Jakarta',
    is_active: true
  };
}

function formFromOutlet(outlet) {
  return {
    name: outlet.name || '',
    code: outlet.code || '',
    address: outlet.address || '',
    phone: outlet.phone || '',
    timezone: outlet.timezone || 'Asia/Jakarta',
    is_active: Boolean(outlet.is_active)
  };
}

function toPayload(form) {
  return {
    name: form.name.trim(),
    code: form.code.trim().toUpperCase(),
    address: form.address.trim(),
    phone: form.phone.trim(),
    timezone: form.timezone.trim() || 'Asia/Jakarta',
    is_active: form.is_active ? 1 : 0
  };
}

function validateForm(form) {
  const errors = [];
  if (form.name.trim().length < 2 || form.name.trim().length > 100) {
    errors.push('Nama outlet wajib diisi (2-100 karakter)');
  }
  if (!OUTLET_CODE_PATTERN.test(form.code.trim().toUpperCase())) {
    errors.push('Kode outlet harus 3-20 karakter huruf besar, angka, atau tanda hubung');
  }
  if (form.address.trim().length > 255) errors.push('Alamat maksimal 255 karakter');
  if (form.phone.trim().length > 30) errors.push('Nomor telepon maksimal 30 karakter');
  if (!form.timezone.trim()) errors.push('Zona waktu wajib diisi');
  return errors;
}

function StatCard({ icon: Icon, label, value, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 border-brand-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-200'
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 shadow-xs">
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${tones[tone] || tones.brand}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-900 leading-tight">{value}</p>
      </div>
    </div>
  );
}

export default function OutletsView() {
  const { activeOutletId, canSwitchOutlet, switchOutlet } = useSession();
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formErrors, setFormErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const fetchOutlets = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setLoadError('');
    try {
      const response = await apiRequest('/outlets');
      setOutlets(response.outlets || []);
    } catch (error) {
      setLoadError(error.message || 'Gagal memuat daftar outlet');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOutlets();
  }, [fetchOutlets]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const filteredOutlets = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return outlets.filter((outlet) => {
      if (statusFilter === 'active' && !outlet.is_active) return false;
      if (statusFilter === 'inactive' && outlet.is_active) return false;
      if (!keyword) return true;
      return (
        outlet.name.toLowerCase().includes(keyword)
        || outlet.code.toLowerCase().includes(keyword)
        || (outlet.address || '').toLowerCase().includes(keyword)
      );
    });
  }, [outlets, search, statusFilter]);

  const stats = useMemo(() => ({
    total: outlets.length,
    active: outlets.filter((outlet) => outlet.is_active).length,
    staff: outlets.reduce((sum, outlet) => sum + (outlet.user_count || 0), 0),
    products: outlets.reduce((sum, outlet) => sum + (outlet.product_count || 0), 0)
  }), [outlets]);

  const openAddModal = () => {
    setEditingOutlet(null);
    setForm(emptyForm());
    setFormErrors([]);
    setModalOpen(true);
  };

  const openEditModal = (outlet) => {
    setEditingOutlet(outlet);
    setForm(formFromOutlet(outlet));
    setFormErrors([]);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingOutlet(null);
    setFormErrors([]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = validateForm(form);
    if (errors.length) {
      setFormErrors(errors);
      return;
    }

    setSaving(true);
    setFormErrors([]);
    try {
      const payload = toPayload(form);
      if (editingOutlet) {
        await apiRequest(`/outlets/${editingOutlet.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        setNotice({ type: 'success', message: `Outlet ${payload.name} berhasil diperbarui` });
      } else {
        await apiRequest('/outlets', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setNotice({ type: 'success', message: `Outlet ${payload.name} berhasil ditambahkan` });
      }

      const wasEmpty = outlets.length === 0;
      setModalOpen(false);
      setEditingOutlet(null);
      await fetchOutlets({ silent: true });

      if (wasEmpty) {
        // The signed-in session was created before any outlet existed.
        window.location.reload();
      }
    } catch (error) {
      setFormErrors(error.details && error.details.length ? error.details : [error.message || 'Gagal menyimpan outlet']);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (outlet) => {
    const nextActive = !outlet.is_active;
    const confirmed = window.confirm(
      nextActive
        ? `Aktifkan kembali outlet ${outlet.name}?`
        : `Nonaktifkan outlet ${outlet.name}? Staf tidak dapat memilih outlet ini sampai diaktifkan kembali.`
    );
    if (!confirmed) return;

    setBusyId(outlet.id);
    try {
      await apiRequest(`/outlets/${outlet.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: outlet.name,
          code: outlet.code,
          address: outlet.address || '',
          phone: outlet.phone || '',
          timezone: outlet.timezone || 'Asia/Jakarta',
          is_active: nextActive ? 1 : 0
        })
      });
      setNotice({ type: 'success', message: `Outlet ${outlet.name} ${nextActive ? 'diaktifkan' : 'dinonaktifkan'}` });
      await fetchOutlets({ silent: true });
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'Gagal mengubah status outlet' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (outlet) => {
    const confirmed = window.confirm(
      `Hapus outlet ${outlet.name} (${outlet.code}) secara permanen? Tindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmed) return;

    setBusyId(outlet.id);
    try {
      await apiRequest(`/outlets/${outlet.id}`, { method: 'DELETE' });
      setNotice({ type: 'success', message: `Outlet ${outlet.name} berhasil dihapus` });
      await fetchOutlets({ silent: true });
    } catch (error) {
      setNotice({
        type: 'error',
        message: error.code === 'OUTLET_IN_USE'
          ? 'Outlet masih memiliki data terkait. Nonaktifkan outlet alih-alih menghapusnya.'
          : (error.message || 'Gagal menghapus outlet')
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenOutlet = (outlet) => {
    if (!outlet.is_active || outlet.id === activeOutletId) return;
    const confirmed = window.confirm(`Buka outlet ${outlet.name} sebagai outlet aktif?`);
    if (confirmed) switchOutlet(outlet.id);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-brand-600" />
            <span>Manajemen Outlet</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Kelola cabang, status operasional, dan outlet aktif untuk seluruh permintaan API.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchOutlets()}
            disabled={loading}
            title="Muat ulang"
            className="p-2.5 rounded-xl border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <RequirePermission permission="outlets.manage">
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-sm shadow-brand-500/20 transition"
            >
              <Plus className="w-4 h-4" />
              Tambah Outlet
            </button>
          </RequirePermission>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard icon={Store} label="Total Outlet" value={stats.total} />
        <StatCard icon={CheckCircle2} label="Aktif" value={stats.active} tone="emerald" />
        <StatCard icon={Users} label="Staf Utama" value={stats.staff} tone="slate" />
        <StatCard icon={Package} label="Produk Aktif" value={stats.products} tone="amber" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama, kode, atau alamat..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
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
            <p className="text-xs">Memuat outlet...</p>
          </div>
        ) : filteredOutlets.length === 0 ? (
          <div className="p-10 text-center">
            <Store className="w-10 h-10 mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">
              {outlets.length === 0 ? 'Belum ada outlet' : 'Tidak ada outlet yang cocok'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {outlets.length === 0
                ? 'Tambahkan outlet pertama untuk mulai mengelola cabang.'
                : 'Coba ubah kata kunci atau filter status.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide text-[10px]">
                <tr>
                  <th className="px-4 py-3 font-bold">Outlet</th>
                  <th className="px-4 py-3 font-bold">Kontak</th>
                  <th className="px-4 py-3 font-bold">Zona Waktu</th>
                  <th className="px-4 py-3 font-bold">Pemakaian</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOutlets.map((outlet) => {
                  const isActiveView = outlet.id === activeOutletId;
                  const isBusy = busyId === outlet.id;
                  return (
                    <tr key={outlet.id} className={isActiveView ? 'bg-brand-50/40' : 'hover:bg-slate-50/60'}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${outlet.is_active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'}`}>
                            <Store className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-800 truncate max-w-[220px]">{outlet.name}</span>
                              {isActiveView && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-600 text-white">AKTIF</span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-slate-400">{outlet.code}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                          <span className="line-clamp-2 max-w-[260px]">{outlet.address || '-'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400">
                          <Phone className="w-3 h-3" />
                          <span>{outlet.phone || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {outlet.timezone}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                            <Users className="w-3 h-3" /> {outlet.user_count}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                            <Package className="w-3 h-3" /> {outlet.product_count}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                            <ReceiptText className="w-3 h-3" /> {outlet.order_count}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          outlet.is_active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${outlet.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {outlet.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {canSwitchOutlet && outlet.is_active && !isActiveView && (
                            <button
                              type="button"
                              onClick={() => handleOpenOutlet(outlet)}
                              title="Jadikan outlet aktif"
                              className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 border border-transparent hover:border-brand-200 transition"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <RequirePermission permission="outlets.manage">
                            <button
                              type="button"
                              onClick={() => openEditModal(outlet)}
                              disabled={isBusy}
                              title="Edit outlet"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-40 transition"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(outlet)}
                              disabled={isBusy}
                              title={outlet.is_active ? 'Nonaktifkan outlet' : 'Aktifkan outlet'}
                              className={`p-1.5 rounded-lg disabled:opacity-40 transition ${
                                outlet.is_active
                                  ? 'text-amber-600 hover:bg-amber-50'
                                  : 'text-emerald-600 hover:bg-emerald-50'
                              }`}
                            >
                              {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(outlet)}
                              disabled={isBusy}
                              title="Hapus outlet"
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </RequirePermission>
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

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingOutlet ? `Edit Outlet: ${editingOutlet.name}` : 'Tambah Outlet Baru'}
        subtitle="Outlet menentukan cakupan data produk, transaksi, shift, dan staf."
        icon={Store}
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
              form="outlet-form"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50 transition"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Menyimpan...' : 'Simpan Outlet'}
            </button>
          </div>
        }
      >
        <form id="outlet-form" onSubmit={handleSubmit} className="space-y-4">
          {formErrors.length > 0 && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <div className="flex items-center gap-1.5 font-semibold mb-1">
                <AlertTriangle className="w-4 h-4" />
                Periksa kembali data outlet
              </div>
              <ul className="list-disc pl-5 space-y-0.5">
                {formErrors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Outlet *</label>
              <input
                type="text"
                required
                maxLength={100}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Contoh: Toko Berkah Mandiri — Cabang Gejayan"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Outlet *</label>
              <input
                type="text"
                required
                maxLength={20}
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                placeholder="TBM-02"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
              />
              <p className="text-[10px] text-slate-400 mt-1">3-20 karakter: huruf besar, angka, tanda hubung.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Zona Waktu *</label>
              <input
                type="text"
                required
                list="outlet-timezones"
                value={form.timezone}
                onChange={(event) => setForm({ ...form, timezone: event.target.value })}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
              />
              <datalist id="outlet-timezones">
                {TIMEZONE_OPTIONS.map((timezone) => <option key={timezone} value={timezone} />)}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Telepon</label>
              <input
                type="tel"
                maxLength={30}
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="0812-3456-7890"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status Operasional</label>
              <label className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-slate-700">Outlet aktif dan dapat dipilih staf</span>
              </label>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat Lengkap</label>
              <textarea
                rows={2}
                maxLength={255}
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                placeholder="Jl. Contoh No. 1, Kecamatan, Kota"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white resize-none"
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
