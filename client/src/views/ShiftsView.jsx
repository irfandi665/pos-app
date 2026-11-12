import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Banknote, 
  PlusCircle, 
  MinusCircle, 
  Lock, 
  CheckCircle2, 
  AlertTriangle, 
  Printer, 
  History 
} from 'lucide-react';
import { apiRequest, formatRupiah, formatDateTime } from '../api';
import ManagerPinModal from '../components/ManagerPinModal';

export default function ShiftsView({ user }) {
  const [activeShift, setActiveShift] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Open Shift Form
  const [startingCashInput, setStartingCashInput] = useState('200000');

  // Cash In / Cash Out Modal
  const [showCashLogModal, setShowCashLogModal] = useState(false);
  const [cashLogType, setCashLogType] = useState('cash_out'); // 'cash_in' | 'cash_out'
  const [cashLogAmount, setCashLogAmount] = useState('');
  const [cashLogReason, setCashLogReason] = useState('');

  // Close Shift Modal
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [actualCashCount, setActualCashCount] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingCloseData, setPendingCloseData] = useState(null);

  // Closed Shift Summary Print Modal
  const [lastClosedSummary, setLastClosedSummary] = useState(null);

  const fetchShiftData = async () => {
    setLoading(true);
    try {
      const [currRes, histRes] = await Promise.all([
        apiRequest('/shifts/current'),
        apiRequest('/shifts/history')
      ]);
      setActiveShift(currRes.active_shift || null);
      setHistory(histRes.shifts || []);
      if (currRes.active_shift) {
        setActualCashCount(String(currRes.active_shift.expected_cash));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShiftData();
  }, []);

  const handleOpenShift = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/shifts/open', {
        method: 'POST',
        body: JSON.stringify({ starting_cash: parseInt(startingCashInput || 0, 10) })
      });
      fetchShiftData();
    } catch (err) {
      alert(err.message || 'Gagal membuka shift');
    }
  };

  const handleSaveCashLog = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/shifts/cash-movement', {
        method: 'POST',
        body: JSON.stringify({
          type: cashLogType,
          amount: parseInt(cashLogAmount, 10),
          reason: cashLogReason
        })
      });
      setShowCashLogModal(false);
      setCashLogAmount('');
      setCashLogReason('');
      fetchShiftData();
    } catch (err) {
      alert(err.message || 'Gagal mencatat kas');
    }
  };

  const handleAttemptCloseShift = async () => {
    const actual = parseInt(actualCashCount || 0, 10);
    const expected = activeShift.expected_cash;
    const diff = actual - expected;

    if (Math.abs(diff) > 10000) {
      // Discrepancy > Rp 10.000 requires manager PIN!
      setPendingCloseData({ actual, notes: closeNotes, diff });
      setShowPinModal(true);
      return;
    }

    // Direct close if no high variance
    try {
      const res = await apiRequest('/shifts/close', {
        method: 'POST',
        body: JSON.stringify({
          actual_cash: actual,
          notes: closeNotes
        })
      });
      setShowCloseModal(false);
      setLastClosedSummary(res.summary);
      fetchShiftData();
    } catch (err) {
      alert(err.message || 'Gagal menutup shift');
    }
  };

  const handlePinSuccess = async (pin, manager) => {
    setShowPinModal(false);
    if (!pendingCloseData) return;

    try {
      const res = await apiRequest('/shifts/close', {
        method: 'POST',
        body: JSON.stringify({
          actual_cash: pendingCloseData.actual,
          notes: `${pendingCloseData.notes ? pendingCloseData.notes + ' • ' : ''}Selisih disetujui Manajer ${manager.full_name}`,
          manager_pin: pin
        })
      });
      setShowCloseModal(false);
      setLastClosedSummary(res.summary);
      setPendingCloseData(null);
      fetchShiftData();
    } catch (err) {
      alert(err.message || 'Gagal menutup shift');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Clock className="w-6 h-6 text-brand-600" />
          <span>Manajemen Shift & Rekap Kas Laci Kasir</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Buka shift dengan modal awal, pantau uang tunai dan QRIS secara langsung, serta tutup shift dengan verifikasi selisih kas fisik
        </p>
      </div>

      {/* ACTIVE SHIFT STATUS */}
      {activeShift ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <h3 className="font-bold text-base text-slate-900">Shift Kasir Aktif Sedang Berjalan</h3>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  Open
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Dibuka: {formatDateTime(activeShift.start_time)} • Kasir: <span className="font-semibold text-slate-800">{activeShift.cashier_name}</span>
              </p>
            </div>

            {/* Cash Movements and Close Shift Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setCashLogType('cash_in');
                  setShowCashLogModal(true);
                }}
                className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition"
              >
                <PlusCircle className="w-4 h-4 text-emerald-600" />
                <span>Kas Masuk</span>
              </button>

              <button
                onClick={() => {
                  setCashLogType('cash_out');
                  setShowCashLogModal(true);
                }}
                className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition"
              >
                <MinusCircle className="w-4 h-4 text-rose-600" />
                <span>Kas Keluar (Biaya)</span>
              </button>

              <button
                onClick={() => setShowCloseModal(true)}
                className="py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20 flex items-center gap-1.5 transition active:scale-[0.98]"
              >
                <Lock className="w-4 h-4" />
                <span>Tutup Shift Kasir</span>
              </button>
            </div>
          </div>

          {/* Cash & Sales Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-xs text-slate-500 font-medium">Modal Awal Kasir</span>
              <div className="text-xl font-bold text-slate-800 mt-1">
                {formatRupiah(activeShift.starting_cash)}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Uang kembalian awal</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-xs text-slate-500 font-medium">Penjualan Tunai</span>
              <div className="text-xl font-bold text-emerald-700 mt-1">
                +{formatRupiah(activeShift.cash_sales)}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Masuk ke laci kas</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-xs text-slate-500 font-medium">Kas Masuk / Keluar</span>
              <div className="text-sm font-bold text-slate-800 mt-1">
                <span className="text-emerald-600">+{formatRupiah(activeShift.cash_in)}</span> / <span className="text-rose-600">-{formatRupiah(activeShift.cash_out)}</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Petty cash operasional</span>
            </div>

            <div className="p-4 bg-brand-50 rounded-2xl border border-brand-200">
              <span className="text-xs text-brand-700 font-bold">Harus Ada di Laci Kas:</span>
              <div className="text-2xl font-black text-brand-900 mt-1">
                {formatRupiah(activeShift.expected_cash)}
              </div>
              <span className="text-[10px] text-brand-600 mt-1 block">Modal + Tunai + Kas Bersih</span>
            </div>
          </div>

          {/* Non-cash methods breakdown */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-6 text-xs text-slate-600">
            <div>
              Total Penjualan QRIS: <span className="font-bold text-slate-900">{formatRupiah(activeShift.qris_sales)}</span> (Rekap Ledger Otomatis)
            </div>
            <div>
              Total Kartu / EDC: <span className="font-bold text-slate-900">{formatRupiah(activeShift.card_sales)}</span>
            </div>
            <div>
              Total Omzet Shift Ini: <span className="font-bold text-brand-700">{formatRupiah(activeShift.total_sales)}</span>
            </div>
          </div>
        </div>
      ) : (
        /* NO ACTIVE SHIFT: OPEN SHIFT PROMPT */
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xs mb-8 max-w-md mx-auto text-center">
          <div className="w-14 h-14 bg-brand-50 text-brand-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-inner">
            <Clock className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-base text-slate-900">Buka Shift Kasir Baru</h3>
          <p className="text-xs text-slate-500 mt-1 mb-5">
            Masukkan jumlah modal awal uang kembalian pada laci kas untuk memulai shift transaksi.
          </p>

          <form onSubmit={handleOpenShift} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Modal Awal Laci (Rp)</label>
              <input
                type="number"
                required
                value={startingCashInput}
                onChange={(e) => setStartingCashInput(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[100000, 200000, 500000].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setStartingCashInput(String(amt))}
                  className="py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                >
                  {formatRupiah(amt)}
                </button>
              ))}
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-sm shadow-md transition"
            >
              Buka Shift Sekarang
            </button>
          </form>
        </div>
      )}

      {/* SHIFT HISTORY */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
        <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
          <History className="w-4 h-4 text-brand-600" />
          <span>Riwayat Shift & Rekonsiliasi Kas Laci</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Waktu Buka / Tutup</th>
                <th className="py-2.5 px-3">Kasir</th>
                <th className="py-2.5 px-3 text-right">Modal Awal</th>
                <th className="py-2.5 px-3 text-right">Hitungan Seharusnya</th>
                <th className="py-2.5 px-3 text-right">Hitungan Fisik Kasir</th>
                <th className="py-2.5 px-3 text-center">Selisih Kas</th>
                <th className="py-2.5 px-3">Otorisasi Manajer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map(s => {
                const diff = s.cash_difference || 0;
                return (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-500">
                      <div>Buka: {formatDateTime(s.start_time)}</div>
                      {s.end_time && <div>Tutup: {formatDateTime(s.end_time)}</div>}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap font-bold text-slate-800">{s.cashier_name}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-right font-medium text-slate-600">{formatRupiah(s.starting_cash)}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-right font-semibold text-slate-800">{formatRupiah(s.expected_cash)}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-right font-bold text-slate-900">{s.actual_cash !== null ? formatRupiah(s.actual_cash) : '-'}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-center font-bold">
                      {s.actual_cash !== null ? (
                        diff === 0 ? (
                          <span className="text-emerald-600">Pas (0)</span>
                        ) : diff > 0 ? (
                          <span className="text-blue-600">+{formatRupiah(diff)}</span>
                        ) : (
                          <span className="text-rose-600">{formatRupiah(diff)}</span>
                        )
                      ) : (
                        <span className="text-amber-600 font-semibold">Shift Aktif</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {s.manager_name ? (
                        <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                          Disetujui: {s.manager_name}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cash In / Out Modal */}
      {showCashLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 border border-slate-200">
            <h3 className="font-bold text-base text-slate-900 mb-1">
              {cashLogType === 'cash_in' ? 'Catat Kas Masuk' : 'Catat Kas Keluar / Biaya'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">Catatan pengeluaran kecil atau penambahan modal laci</p>

            <form onSubmit={handleSaveCashLog} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nominal (Rp)</label>
                <input
                  type="number"
                  required
                  placeholder="Contoh: 25000"
                  value={cashLogAmount}
                  onChange={(e) => setCashLogAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alasan / Keterangan</label>
                <input
                  type="text"
                  required
                  placeholder={cashLogType === 'cash_in' ? 'Tambahan uang kecil kembalian' : 'Beli kantong plastik, es batu...'}
                  value={cashLogReason}
                  onChange={(e) => setCashLogReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCashLogModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold shadow-md"
                >
                  Simpan Catatan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Shift Modal */}
      {showCloseModal && activeShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="font-bold text-base text-slate-900 mb-1">Tutup Shift Kasir & Rekonsiliasi Kas</h3>
            <p className="text-xs text-slate-500 mb-4">Hitung seluruh uang tunai fisik yang ada di dalam laci kasir saat ini</p>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-slate-100 rounded-2xl flex justify-between items-center font-bold">
                <span className="text-slate-600">Perhitungan Sistem (Harus Ada):</span>
                <span className="text-base font-black text-slate-900">{formatRupiah(activeShift.expected_cash)}</span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Hitungan Fisik Uang di Laci (Rp)</label>
                <input
                  type="number"
                  required
                  value={actualCashCount}
                  onChange={(e) => setActualCashCount(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-lg font-black text-slate-900"
                />
              </div>

              {/* Calculated variance alert */}
              {(() => {
                const diff = (parseInt(actualCashCount || 0, 10)) - activeShift.expected_cash;
                return (
                  <div className={`p-3 rounded-2xl flex items-center justify-between font-bold ${
                    diff === 0 
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}>
                    <span>Selisih Kas:</span>
                    <span className="text-sm font-black">
                      {diff === 0 ? 'Cocok Sempurna (Rp 0)' : `${diff > 0 ? '+' : ''}${formatRupiah(diff)}`}
                    </span>
                  </div>
                );
              })()}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Catatan Tutup Shift</label>
                <input
                  type="text"
                  placeholder="Keterangan tambahan jika ada selisih..."
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleAttemptCloseShift}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md"
                >
                  Konfirmasi Tutup Shift
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Closed Shift Summary Report Modal */}
      {lastClosedSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center border border-slate-200">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <h3 className="font-bold text-base text-slate-900">Shift Berhasil Ditutup</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">Rekap penutupan shift telah tersimpan ke dalam database dan audit log.</p>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left text-xs space-y-1.5 mb-4">
              <div className="flex justify-between">
                <span>Modal Awal:</span>
                <span className="font-bold">{formatRupiah(lastClosedSummary.starting_cash)}</span>
              </div>
              <div className="flex justify-between">
                <span>Penjualan Tunai:</span>
                <span className="font-bold">{formatRupiah(lastClosedSummary.cash_sales)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kas Seharusnya:</span>
                <span className="font-bold">{formatRupiah(lastClosedSummary.expected_cash)}</span>
              </div>
              <div className="flex justify-between">
                <span>Hitungan Fisik:</span>
                <span className="font-bold">{formatRupiah(lastClosedSummary.actual_cash)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                <span>Selisih:</span>
                <span className={lastClosedSummary.cash_difference === 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {formatRupiah(lastClosedSummary.cash_difference)}
                </span>
              </div>
            </div>

            <button
              onClick={() => setLastClosedSummary(null)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl"
            >
              Selesai
            </button>
          </div>
        </div>
      )}

      {/* Manager PIN Modal */}
      <ManagerPinModal
        isOpen={showPinModal}
        title="Otorisasi Selisih Kas Shift"
        description="Selisih kas melebihi batas toleransi (> Rp 10.000). Masukkan PIN Manajer untuk mengesahkan penutupan shift ini."
        onSuccess={handlePinSuccess}
        onClose={() => setShowPinModal(false)}
      />
    </div>
  );
}
