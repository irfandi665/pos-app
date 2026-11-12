import React, { useState, useEffect } from 'react';
import { ShieldCheck, Search, Lock, User, Terminal } from 'lucide-react';
import { apiRequest, formatDateTime } from '../api';

export default function AuditView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/audit');
      setLogs(res.logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-brand-600" />
          <span>Audit Log Sistem (Immutable)</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Rekaman jejak seluruh tindakan penting (Void, Retur, Otorisasi PIN Manajer, Penyesuaian Stok, dan Transaksi QRIS) yang tidak dapat diubah atau dihapus
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Waktu Eksekusi</th>
                <th className="py-2.5 px-3">Pengguna & Peran</th>
                <th className="py-2.5 px-3">Tindakan (Action)</th>
                <th className="py-2.5 px-3">Entitas</th>
                <th className="py-2.5 px-3">Rincian Data</th>
                <th className="py-2.5 px-3">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-3 whitespace-nowrap text-slate-500 font-sans">
                    {formatDateTime(log.created_at)}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap font-sans">
                    <span className="font-bold text-slate-800">{log.user_name || 'System / Guest'}</span>
                    {log.user_role && <span className="ml-1 text-[10px] text-slate-400 font-mono">({log.user_role})</span>}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className="bg-slate-900 text-slate-100 px-2 py-0.5 rounded text-[10px] font-bold">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 font-sans">
                    {log.entity} #{log.entity_id}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 max-w-sm truncate font-mono text-[10px]">
                    {log.details}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-slate-400">
                    {log.ip_address || '127.0.0.1'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
