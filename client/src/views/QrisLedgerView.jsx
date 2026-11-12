import React, { useState, useEffect } from 'react';
import { QrCode, Download, Search, CheckCircle2, Clock, AlertTriangle, XCircle, ArrowUpRight } from 'lucide-react';
import { apiRequest, formatRupiah, formatDateTime } from '../api';

export default function QrisLedgerView() {
  const [ledger, setLedger] = useState([]);
  const [summary, setSummary] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/reconcile/ledger?status=${statusFilter}&search=${encodeURIComponent(search)}`);
      setLedger(res.ledger || []);
      setSummary(res.summary || null);
    } catch (err) {
      console.error('Failed to load ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchLedger();
  };

  const handleExportCsv = () => {
    window.open('/api/reconcile/export-csv', '_blank');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SETTLED':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Settled (Cair)
          </span>
        );
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
            <CheckCircle2 className="w-3 h-3 text-blue-600" /> Paid (Lunas)
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
            <Clock className="w-3 h-3 text-amber-600" /> Pending
          </span>
        );
      case 'DISPUTED':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
            <AlertTriangle className="w-3 h-3 text-purple-600" /> Disputed / Void
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
            <XCircle className="w-3 h-3 text-slate-400" /> Expired
          </span>
        );
      default:
        return <span className="text-xs">{status}</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Title & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <QrCode className="w-6 h-6 text-brand-600" />
            <span>Ledger QRIS Dinamis</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Rekap transaksi QRIS otomatis dengan data nominal bruto, biaya MDR Bank Indonesia, dan status settlement
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition"
        >
          <Download className="w-4 h-4" />
          <span>Ekspor CSV Akuntan</span>
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs text-slate-500 font-medium">Total Omzet QRIS Bruto</span>
            <div className="text-xl font-black text-slate-900 mt-1">{formatRupiah(summary.total_gross)}</div>
            <span className="text-[10px] text-slate-400 mt-1 block">{summary.total_count} total transaksi tercatat</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs text-slate-500 font-medium">Biaya MDR PJP (0.7%)</span>
            <div className="text-xl font-black text-rose-600 mt-1">-{formatRupiah(summary.total_mdr)}</div>
            <span className="text-[10px] text-slate-400 mt-1 block">Potongan resmi BI / PJP</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs text-slate-500 font-medium">Dana Bersih Diterima Toko</span>
            <div className="text-xl font-black text-emerald-600 mt-1">{formatRupiah(summary.total_net)}</div>
            <span className="text-[10px] text-slate-400 mt-1 block">Setelah potongan MDR</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs text-slate-500 font-medium">Status Settlement</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-bold text-emerald-600">{summary.settled_count} Settled</span>
              <span className="text-slate-300">•</span>
              <span className="text-sm font-bold text-blue-600">{summary.paid_unsettled_count} Menunggu H+1</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">{summary.pending_count} pending QR aktif</span>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs mb-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        {/* Status Pills */}
        <div className="flex gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: 'ALL', label: 'Semua Status' },
            { id: 'SETTLED', label: 'Settled (Cair)' },
            { id: 'PAID', label: 'Paid (Belum Settled)' },
            { id: 'PENDING', label: 'Pending' },
            { id: 'DISPUTED', label: 'Disputed' }
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                statusFilter === s.id
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari Ref PJP, RRN, Order ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </form>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Waktu Transaksi</th>
                <th className="py-3 px-4">Order ID & Kasir</th>
                <th className="py-3 px-4">PJP Ref & RRN Trace</th>
                <th className="py-3 px-4">Sumber Bayar</th>
                <th className="py-3 px-4 text-right">Nominal Bruto</th>
                <th className="py-3 px-4 text-right">MDR (0.7%)</th>
                <th className="py-3 px-4 text-right">Nominal Bersih</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-slate-400">
                    Memuat data ledger QRIS...
                  </td>
                </tr>
              ) : ledger.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-slate-400">
                    Tidak ada transaksi QRIS yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                ledger.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                      <div>{formatDateTime(row.created_at)}</div>
                      {row.paid_at && <div className="text-[10px] text-emerald-600">Lunas: {formatDateTime(row.paid_at)}</div>}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-bold text-slate-800">{row.order_id}</span>
                      <div className="text-[11px] text-slate-400">{row.cashier_name || 'Kasir'}</div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px]">
                      <div className="font-semibold text-slate-700">{row.transaction_ref}</div>
                      <div className="text-[10px] text-slate-400">RRN: {row.issuer_ref || '-'}</div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-semibold text-slate-700">{row.customer_bank_or_wallet || 'QRIS Dinamis'}</span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right font-black text-slate-900">
                      {formatRupiah(row.amount)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right text-rose-600 font-semibold">
                      -{formatRupiah(row.mdr_amount)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right font-black text-emerald-600">
                      {formatRupiah(row.net_amount)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-center">
                      {getStatusBadge(row.status)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
