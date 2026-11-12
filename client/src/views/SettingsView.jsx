import React, { useState, useEffect } from 'react';
import { Settings, Save, CheckCircle2, ShieldAlert, Store, Printer, QrCode } from 'lucide-react';
import { apiRequest } from '../api';

export default function SettingsView({ user }) {
  const [settings, setSettings] = useState({
    store_name: '',
    store_address: '',
    store_phone: '',
    tax_rate: '11',
    tax_enabled: 'true',
    mdr_qris_rate: '0.7',
    pjp_provider: 'XENDIT_OR_MIDTRANS',
    pjp_merchant_id: 'MID-ID-QRIS-789123',
    receipt_footer: '',
    printer_type: '58mm'
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiRequest('/settings')
      .then(res => {
        if (res.settings) {
          setSettings(prev => ({ ...prev, ...res.settings }));
        }
      })
      .catch(console.error);
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await apiRequest('/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      alert(err.message || 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-brand-600" />
          <span>Pengaturan Sistem & Kebijakan Toko</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Konfigurasi identitas toko, tarif pajak PPN/PB1, persentase MDR QRIS Bank Indonesia, dan format printer struk
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Store Profile */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
          <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
            <Store className="w-4 h-4 text-brand-600" />
            <span>Identitas Outlet & Struk</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nama Toko</label>
              <input
                type="text"
                value={settings.store_name}
                onChange={(e) => setSettings({ ...settings, store_name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nomor Telepon Toko</label>
              <input
                type="text"
                value={settings.store_phone}
                onChange={(e) => setSettings({ ...settings, store_phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Alamat Lengkap Toko</label>
              <input
                type="text"
                value={settings.store_address}
                onChange={(e) => setSettings({ ...settings, store_address: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Catatan Kaki Struk (Receipt Footer)</label>
              <textarea
                rows={2}
                value={settings.receipt_footer}
                onChange={(e) => setSettings({ ...settings, receipt_footer: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* Financial & Rates */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
          <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-brand-600" />
            <span>Tarif Pajak & MDR QRIS Bank Indonesia</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tarif Pajak PPN/PB1 (%)</label>
              <input
                type="number"
                step="0.1"
                value={settings.tax_rate}
                onChange={(e) => setSettings({ ...settings, tax_rate: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Standar PPN 11% atau PB1 restoran 10%</span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Biaya MDR QRIS (%)</label>
              <input
                type="number"
                step="0.01"
                value={settings.mdr_qris_rate}
                onChange={(e) => setSettings({ ...settings, mdr_qris_rate: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-rose-600"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Regulasi BI UMKM: 0.3% - 0.7%</span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Penyelenggara Jasa Pembayaran (PJP)</label>
              <select
                value={settings.pjp_provider}
                onChange={(e) => setSettings({ ...settings, pjp_provider: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
              >
                <option value="XENDIT_OR_MIDTRANS">Xendit / Midtrans Gateway</option>
                <option value="DOKU">DOKU Payment Gateway</option>
                <option value="BANK_MANDIRI_QRIS">Bank Mandiri Direct QRIS</option>
                <option value="BCA_QRIS">BCA Direct QRIS</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">National Merchant ID (NMID)</label>
              <input
                type="text"
                value={settings.pjp_merchant_id}
                onChange={(e) => setSettings({ ...settings, pjp_merchant_id: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
              />
            </div>
          </div>
        </div>

        {/* Hardware & Printer */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
          <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
            <Printer className="w-4 h-4 text-brand-600" />
            <span>Format Printer Struk Kasir</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ukuran Kertas Thermal ESC/POS</label>
              <select
                value={settings.printer_type}
                onChange={(e) => setSettings({ ...settings, printer_type: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
              >
                <option value="58mm">58 mm (Printer Thermal Mini / Portabel)</option>
                <option value="80mm">80 mm (Printer Kasir Standar Resto / Kasir Besar)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between">
          {saved && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
              <span>Pengaturan berhasil disimpan!</span>
            </div>
          )}
          <button
            type="submit"
            disabled={saving}
            className="ml-auto py-3 px-6 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-md flex items-center gap-2 transition"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Semua Pengaturan'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
