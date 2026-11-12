import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart, 
  Users, 
  Calendar,
  CreditCard,
  Banknote,
  QrCode
} from 'lucide-react';
import { apiRequest, formatRupiah } from '../api';

export default function ReportsView() {
  const [period, setPeriod] = useState('month'); // 'today' | 'week' | 'month'
  const [financial, setFinancial] = useState(null);
  const [products, setProducts] = useState(null);
  const [cashiers, setCashiers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [finRes, prodRes, cashRes] = await Promise.all([
        apiRequest(`/reports/financial?period=${period}`),
        apiRequest('/reports/products'),
        apiRequest('/reports/cashiers')
      ]);

      setFinancial(finRes);
      setProducts(prodRes);
      setCashiers(cashRes.cashiers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [period]);

  const summary = financial?.summary;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Title & Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-brand-600" />
            <span>Laporan Keuangan & Analitik Bisnis</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Pantau omzet penjualan, HPP (modal), laba bersih riil, serta performa produk dan kasir
          </p>
        </div>

        {/* Period Selector Pills */}
        <div className="flex bg-white p-1 rounded-2xl border border-slate-200">
          {[
            { id: 'today', label: 'Hari Ini' },
            { id: 'week', label: '7 Hari Terakhir' },
            { id: 'month', label: 'Bulan Ini' }
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                period === p.id ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Financial KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
            <span className="text-xs text-slate-500 font-medium">Omzet Kotor (Gross Sales)</span>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {formatRupiah(summary.gross_sales)}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {summary.total_transactions} transaksi lunas
            </span>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
            <span className="text-xs text-slate-500 font-medium">Total HPP / Modal Pokok</span>
            <div className="text-2xl font-black text-slate-700 mt-1">
              {formatRupiah(summary.total_cogs)}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Modal barang terjual
            </span>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
            <span className="text-xs text-slate-500 font-medium">Potongan MDR QRIS</span>
            <div className="text-2xl font-black text-rose-600 mt-1">
              -{formatRupiah(summary.qris_mdr_fee)}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Biaya pemrosesan PJP
            </span>
          </div>

          <div className="bg-gradient-to-tr from-brand-700 to-indigo-700 text-white p-5 rounded-3xl shadow-md">
            <span className="text-xs text-indigo-200 font-medium">Laba Bersih Riil (Net Profit)</span>
            <div className="text-2xl font-black mt-1">
              {formatRupiah(summary.net_profit)}
            </div>
            <span className="text-[11px] text-indigo-200 mt-1 block font-bold">
              Margin Untung: {summary.profit_margin}%
            </span>
          </div>
        </div>
      )}

      {/* Breakdown: Payment Methods & Product Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        {/* Payment Methods Breakdown (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
          <h3 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-brand-600" />
            <span>Sebaran Metode Pembayaran</span>
          </h3>

          <div className="space-y-3 mt-4">
            {financial?.paymentBreakdown?.map((pb, idx) => (
              <div key={idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700">
                    {pb.payment_method === 'qris' ? <QrCode className="w-4 h-4 text-emerald-600" /> :
                     pb.payment_method === 'cash' ? <Banknote className="w-4 h-4 text-blue-600" /> :
                     <CreditCard className="w-4 h-4 text-purple-600" />}
                  </div>
                  <div>
                    <span className="font-bold text-xs text-slate-900 uppercase">{pb.payment_method}</span>
                    <span className="text-[11px] text-slate-400 block">{pb.count} pembayaran</span>
                  </div>
                </div>
                <span className="font-black text-xs text-slate-800">{formatRupiah(pb.total)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fast Moving & Slow Moving Products (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
          <h3 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>Produk Terlaris (Fast-Moving)</span>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Nama Produk</th>
                  <th className="py-2.5 px-3 font-mono">SKU</th>
                  <th className="py-2.5 px-3 text-center">Terjual</th>
                  <th className="py-2.5 px-3 text-right">Total Pendapatan</th>
                  <th className="py-2.5 px-3 text-center">Sisa Stok</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products?.fastMoving?.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{item.name}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{item.sku}</td>
                    <td className="py-2.5 px-3 text-center font-black text-emerald-600">{item.total_sold} pcs</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatRupiah(item.total_revenue)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                        {item.stock}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Staff & Cashier Performance */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
        <h3 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-600" />
          <span>Performa Kasir & Karyawan</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Nama Staf</th>
                <th className="py-2.5 px-3">Peran</th>
                <th className="py-2.5 px-3 text-center">Jumlah Transaksi</th>
                <th className="py-2.5 px-3 text-right">Total Nilai Penjualan</th>
                <th className="py-2.5 px-3 text-right">Rata-rata Nilai Belanja (Basket Size)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cashiers.map((c, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-3 font-bold text-slate-900">{c.full_name}</td>
                  <td className="py-2.5 px-3">
                    <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {c.role}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-slate-800">{c.total_transactions}</td>
                  <td className="py-2.5 px-3 text-right font-black text-brand-700">{formatRupiah(c.total_sales)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-700">{formatRupiah(c.avg_ticket)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
