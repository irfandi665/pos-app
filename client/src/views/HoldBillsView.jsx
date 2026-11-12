import React, { useState, useEffect } from 'react';
import { PauseCircle, Play, Trash2, Clock, AlertCircle } from 'lucide-react';
import { apiRequest, formatRupiah, formatDateTime } from '../api';

export default function HoldBillsView({ onResumeBill }) {
  const [heldOrders, setHeldOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHeldOrders = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/orders/held/list');
      setHeldOrders(res.heldOrders || []);
    } catch (err) {
      setError(err.message || 'Gagal memuat pesanan tersimpan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeldOrders();
  }, []);

  const handleDelete = async (id) => {
    if (!confirm('Hapus pesanan tersimpan ini?')) return;
    try {
      await apiRequest(`/orders/held/${id}`, { method: 'DELETE' });
      setHeldOrders(prev => prev.filter(o => o.id !== id));
    } catch (err) {
      alert(err.message || 'Gagal menghapus pesanan');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <PauseCircle className="w-6 h-6 text-amber-500" />
            <span>Tagihan Tersimpan (Hold Bills)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Daftar pesanan kasir yang ditahan sementara (Save Bill) untuk melayani antrean lain
          </p>
        </div>
        <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full">
          {heldOrders.length} Pesanan Tertahan
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-xs">Memuat tagihan tersimpan...</div>
      ) : heldOrders.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
          <PauseCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">Tidak ada tagihan tertahan</h3>
          <p className="text-xs text-slate-400 mt-1">
            Anda dapat menahan pesanan kasir menggunakan tombol "Hold Bill" pada layar kasir.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {heldOrders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="font-bold text-sm text-slate-900">{order.held_name || order.id}</span>
                  <span className="text-[11px] font-mono text-slate-400">{order.id}</span>
                </div>

                <div className="mt-2 text-xs text-slate-500 space-y-1">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{formatDateTime(order.created_at)}</span>
                  </div>
                  <div>Kasir: <span className="font-semibold text-slate-700">{order.cashier_name}</span></div>
                </div>

                {/* Items summary */}
                <div className="mt-3 pt-2 border-t border-slate-100 space-y-1 max-h-28 overflow-y-auto pr-1">
                  {order.items?.map((it, idx) => (
                    <div key={idx} className="flex justify-between text-xs text-slate-700">
                      <span className="truncate pr-2">{it.quantity}x {it.product_name}</span>
                      <span className="font-semibold shrink-0">{formatRupiah(it.total)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs text-slate-500">Total Tagihan:</span>
                  <span className="text-base font-black text-brand-700">{formatRupiah(order.total_amount)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleDelete(order.id)}
                    className="py-2 px-3 rounded-xl border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-600 hover:text-rose-600 text-xs font-semibold flex items-center justify-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                  <button
                    onClick={() => onResumeBill(order)}
                    className="py-2 px-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center justify-center gap-1 shadow-sm transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Buka di Kasir</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
