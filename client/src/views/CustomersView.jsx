import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, Award, ShieldCheck, Check } from 'lucide-react';
import { apiRequest, formatDateTime } from '../api';

export default function CustomersView() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    birthdate: '',
    membership_tier: 'standard'
  });

  const fetchCustomers = async () => {
    try {
      const res = await apiRequest(`/customers?search=${encodeURIComponent(search)}`);
      setCustomers(res.customers || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/customers', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      setShowAddModal(false);
      setFormData({ name: '', phone: '', email: '', birthdate: '', membership_tier: 'standard' });
      fetchCustomers();
    } catch (err) {
      alert(err.message || 'Gagal menambahkan pelanggan');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-600" />
            <span>Manajemen Pelanggan & Loyalitas (CRM)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Data pelanggan, poin belanja, tingkat keanggotaan (tier), dan persetujuan UU Pelindungan Data Pribadi (PDP)
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Pelanggan Baru</span>
        </button>
      </div>

      {/* Customer List Table */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between">
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama atau no. telepon..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchCustomers()}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>
          <span className="text-xs text-slate-500">{customers.length} pelanggan terdaftar</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Nama Pelanggan</th>
                <th className="py-2.5 px-3">Nomor Telepon</th>
                <th className="py-2.5 px-3">Email</th>
                <th className="py-2.5 px-3 text-center">Tier Member</th>
                <th className="py-2.5 px-3 text-center">Poin Loyalitas</th>
                <th className="py-2.5 px-3 text-center">Status UU PDP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-3 font-bold text-slate-900">{c.name}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-600">{c.phone}</td>
                  <td className="py-2.5 px-3 text-slate-500">{c.email || '-'}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`inline-block uppercase text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      c.membership_tier === 'gold' ? 'bg-amber-100 text-amber-800' :
                      c.membership_tier === 'silver' ? 'bg-slate-200 text-slate-800' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {c.membership_tier}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-brand-700">
                    {c.points} pts
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      Consent OK
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 border border-slate-200">
            <h3 className="font-bold text-base text-slate-900 mb-1">Daftar Pelanggan CRM Baru</h3>
            <p className="text-xs text-slate-500 mb-4">Persetujuan pemrosesan data (UU PDP No. 27 Tahun 2022) dicatat otomatis</p>

            <form onSubmit={handleAddCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                  placeholder="Contoh: Rina Melati"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nomor WhatsApp / HP</label>
                <input
                  type="text"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                  placeholder="081234567890"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email (Opsional)</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                  placeholder="rina@example.com"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tier Keanggotaan</label>
                <select
                  value={formData.membership_tier}
                  onChange={(e) => setFormData({ ...formData, membership_tier: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                >
                  <option value="standard">Standard Member</option>
                  <option value="silver">Silver Member</option>
                  <option value="gold">Gold Member (VIP)</option>
                </select>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold shadow-md"
                >
                  Daftarkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
