import React, { useState, useEffect } from 'react';
import { 
  CheckCheck, 
  Upload, 
  Play, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  FileSpreadsheet, 
  HelpCircle, 
  Check, 
  Layers,
  ArrowRight,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { apiRequest, formatRupiah, formatDateTime } from '../api';
import ManagerPinModal from '../components/ManagerPinModal';

export default function ReconcileView({ user }) {
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [batchDetails, setBatchDetails] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [ticketFilter, setTicketFilter] = useState('OPEN'); // 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'ALL'

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Ticket resolution state
  const [resolvingTicket, setResolvingTicket] = useState(null);
  const [resolutionStatus, setResolutionStatus] = useState('RESOLVED');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [batchesRes, ticketsRes] = await Promise.all([
        apiRequest('/reconcile/batches'),
        apiRequest(`/reconcile/tickets?status=${ticketFilter}`)
      ]);

      setBatches(batchesRes.batches || []);
      setTickets(ticketsRes.tickets || []);

      if (batchesRes.batches && batchesRes.batches.length > 0 && !selectedBatchId) {
        loadBatchDetails(batchesRes.batches[0].id);
      }
    } catch (err) {
      setError(err.message || 'Gagal memuat data rekonsiliasi');
    } finally {
      setLoading(false);
    }
  };

  const loadBatchDetails = async (id) => {
    setSelectedBatchId(id);
    try {
      const res = await apiRequest(`/reconcile/batch/${id}`);
      setBatchDetails(res);
    } catch (err) {
      console.error('Failed to load batch details:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [ticketFilter]);

  // One-click simulated PJP settlement reconciliation
  const handleSimulateSettlement = async () => {
    setActionLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await apiRequest('/reconcile/simulate-auto-settlement', {
        method: 'POST'
      });
      setSuccessMsg(res.message);
      await fetchData();
      if (res.result?.settlementBatchId) {
        loadBatchDetails(res.result.settlementBatchId);
      }
    } catch (err) {
      setError(err.message || 'Gagal menjalankan simulasi rekonsiliasi');
    } finally {
      setActionLoading(false);
    }
  };

  // CSV file upload handler
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('settlement_file', file);
    formData.append('settlement_date', new Date().toISOString().split('T')[0]);

    setActionLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await apiRequest('/reconcile/upload-settlement', {
        method: 'POST',
        body: formData
      });
      setSuccessMsg(res.message);
      await fetchData();
      if (res.result?.settlementBatchId) {
        loadBatchDetails(res.result.settlementBatchId);
      }
    } catch (err) {
      setError(err.message || 'Gagal mengunggah file settlement');
    } finally {
      setActionLoading(false);
      e.target.value = '';
    }
  };

  // Start resolving ticket
  const handleOpenResolveTicket = (ticket) => {
    setResolvingTicket(ticket);
    setResolutionStatus('RESOLVED');
    setResolutionNotes(`Diselesaikan oleh ${user.full_name}: Bukti transfer PJP telah dikonfirmasi cocok.`);
    setShowPinModal(true);
  };

  const handlePinSuccess = async (pin, manager) => {
    setShowPinModal(false);
    if (!resolvingTicket) return;

    try {
      await apiRequest(`/reconcile/tickets/${resolvingTicket.id}`, {
        method: 'PUT',
        headers: { 'x-manager-pin': pin },
        body: JSON.stringify({
          status: resolutionStatus,
          resolution: resolutionNotes,
          manager_pin: pin
        })
      });

      setSuccessMsg(`Tiket ${resolvingTicket.ticket_number} berhasil diperbarui.`);
      setResolvingTicket(null);
      fetchData();
      if (selectedBatchId) loadBatchDetails(selectedBatchId);
    } catch (err) {
      alert(err.message || 'Gagal memperbarui tiket');
    }
  };

  const getMatchBadge = (matchStatus) => {
    switch (matchStatus) {
      case 'MATCHED':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
            <Check className="w-3 h-3 text-emerald-600" /> Matched (Cocok)
          </span>
        );
      case 'AMOUNT_MISMATCH':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3 text-rose-600" /> Amount Mismatch
          </span>
        );
      case 'MISSING_IN_POS':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
            <HelpCircle className="w-3 h-3 text-purple-600" /> Missing in POS
          </span>
        );
      case 'MISSING_IN_SETTLEMENT':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3 text-amber-600" /> Missing in Settlement
          </span>
        );
      default:
        return <span>{matchStatus}</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header & Importer Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CheckCheck className="w-6 h-6 text-brand-600" />
            <span>Rekonsiliasi QRIS Otomatis (H+1)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Mencocokkan Ledger POS dengan laporan settlement PJP Bank Indonesia secara otomatis tanpa spreadsheet manual
          </p>
        </div>

        {/* Action Buttons: 1-Click Simulator & CSV Upload */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold cursor-pointer shadow-xs transition">
            <Upload className="w-4 h-4 text-slate-500" />
            <span>Unggah Settlement CSV</span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>

          <button
            onClick={handleSimulateSettlement}
            disabled={actionLoading}
            className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-brand-500/20 transition active:scale-[0.98]"
          >
            {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Jalankan Rekonsiliasi Otomatis</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 4 Reconciliation Categories Explainer */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>1. Matched</span>
          </div>
          <p className="text-[11px] text-emerald-700 mt-1 leading-snug">
            Transaksi cocok 100% antara catatan kasir POS dan uang yang masuk ke mutasi PJP.
          </p>
        </div>

        <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl">
          <div className="flex items-center gap-1.5 text-rose-800 text-xs font-bold">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>2. Amount Mismatch</span>
          </div>
          <p className="text-[11px] text-rose-700 mt-1 leading-snug">
            Terdapat selisih nominal bruto atau potongan MDR antara sistem POS dan settlement bank.
          </p>
        </div>

        <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl">
          <div className="flex items-center gap-1.5 text-purple-800 text-xs font-bold">
            <HelpCircle className="w-4 h-4 text-purple-600" />
            <span>3. Missing in POS</span>
          </div>
          <p className="text-[11px] text-purple-700 mt-1 leading-snug">
            Ada dana masuk di mutasi bank PJP, tetapi kasir tidak menginput transaksi di POS.
          </p>
        </div>

        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="flex items-center gap-1.5 text-amber-800 text-xs font-bold">
            <Clock className="w-4 h-4 text-amber-600" />
            <span>4. Missing in Settlement</span>
          </div>
          <p className="text-[11px] text-amber-700 mt-1 leading-snug">
            Kasir menandai QRIS lunas, tetapi dana belum masuk pada batch settlement H+1 PJP.
          </p>
        </div>
      </div>

      {/* Discrepancy Action Queue (Antrean Perlu Tindakan) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              <span>Antrean Selisih Rekonsiliasi (Perlu Tindakan Manajer)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Setiap selisih otomatis menjadi tiket yang memerlukan investigasi dan otorisasi PIN Manajer
            </p>
          </div>

          {/* Ticket Filter */}
          <div className="flex gap-1">
            {[
              { id: 'OPEN', label: 'Belum Selesai (Open)' },
              { id: 'RESOLVED', label: 'Terselesaikan (Resolved)' },
              { id: 'ALL', label: 'Semua Tiket' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setTicketFilter(f.id)}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition ${
                  ticketFilter === f.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tickets List */}
        <div className="mt-4 space-y-3">
          {tickets.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="font-semibold text-slate-600">Semua rekonsiliasi beres!</p>
              <p>Tidak ada tiket selisih yang memerlukan tindakan pada filter ini.</p>
            </div>
          ) : (
            tickets.map(ticket => (
              <div
                key={ticket.id}
                className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900">{ticket.ticket_number}</span>
                    {getMatchBadge(ticket.issue_type)}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      ticket.status === 'RESOLVED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800 animate-pulse'
                    }`}>
                      {ticket.status}
                    </span>
                  </div>

                  <p className="text-slate-700 font-medium">{ticket.notes || ticket.discrepancy_notes}</p>
                  
                  <div className="text-[11px] text-slate-400 flex items-center gap-3">
                    <span>PJP Ref: <span className="font-mono text-slate-600">{ticket.pjp_ref}</span></span>
                    {ticket.order_id && <span>Order: <span className="font-mono text-slate-600">{ticket.order_id}</span></span>}
                    <span>Waktu: {formatDateTime(ticket.created_at)}</span>
                  </div>

                  {ticket.resolution && (
                    <div className="mt-1 text-[11px] text-emerald-700 bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
                      <span className="font-bold">Solusi / Catatan:</span> {ticket.resolution}
                    </div>
                  )}
                </div>

                {ticket.status !== 'RESOLVED' && (
                  <button
                    onClick={() => handleOpenResolveTicket(ticket)}
                    className="py-2 px-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shrink-0 flex items-center gap-1 shadow-sm transition"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Investigasi & Selesaikan</span>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Settlement Batch History & Comparison Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Batches List (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200 p-4 shadow-xs">
          <h3 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-brand-600" />
            <span>Riwayat Laporan Settlement</span>
          </h3>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {batches.map(b => {
              const isSel = selectedBatchId === b.id;
              return (
                <div
                  key={b.id}
                  onClick={() => loadBatchDetails(b.id)}
                  className={`p-3 rounded-2xl border text-xs cursor-pointer transition ${
                    isSel
                      ? 'bg-brand-50 border-brand-500 shadow-xs'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-slate-900">{b.batch_id}</span>
                    <span className="text-[10px] text-slate-500">{b.settlement_date}</span>
                  </div>
                  <div className="text-[11px] text-slate-600 truncate">{b.file_name}</div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-emerald-600 font-bold">{b.matched_records} Cocok</span>
                    {b.mismatch_records > 0 ? (
                      <span className="text-rose-600 font-bold">{b.mismatch_records} Selisih</span>
                    ) : (
                      <span className="text-slate-400">0 Selisih</span>
                    )}
                    <span className="font-black text-slate-800">{formatRupiah(b.total_net)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Detailed Batch Items Matching (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
          {batchDetails ? (
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div>
                  <h3 className="font-bold text-base text-slate-900">{batchDetails.batch.batch_id}</h3>
                  <p className="text-xs text-slate-500">
                    File: {batchDetails.batch.file_name} • PJP: {batchDetails.batch.pjp_name} • Tanggal: {batchDetails.batch.settlement_date}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">Total Bersih Cair:</span>
                  <span className="text-lg font-black text-emerald-600">{formatRupiah(batchDetails.batch.total_net)}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Ref PJP & RRN</th>
                      <th className="py-2.5 px-3 text-right">Settlement Bank</th>
                      <th className="py-2.5 px-3 text-right">MDR</th>
                      <th className="py-2.5 px-3 text-right">POS Kasir</th>
                      <th className="py-2.5 px-3">Catatan Rekonsiliasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batchDetails.items.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {getMatchBadge(item.match_status)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]">
                          <div className="font-bold text-slate-800">{item.pjp_ref}</div>
                          <div className="text-[10px] text-slate-400">RRN: {item.rrn || '-'}</div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-right font-bold text-slate-900">
                          {formatRupiah(item.amount_gross)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-right text-rose-600">
                          -{formatRupiah(item.mdr_amount)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-right font-semibold text-slate-700">
                          {item.pos_amount ? formatRupiah(item.pos_amount) : <span className="text-slate-400">-</span>}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-600 max-w-xs">
                          {item.discrepancy_notes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-slate-400 text-xs">
              Pilih batch settlement di sebelah kiri untuk melihat rincian pencocokan.
            </div>
          )}
        </div>
      </div>

      {/* Manager PIN Modal for resolving tickets */}
      <ManagerPinModal
        isOpen={showPinModal}
        title="Otorisasi Penyelesaian Selisih"
        description={`Masukkan PIN Manajer untuk menyelesaikan tiket ${resolvingTicket?.ticket_number}.`}
        onSuccess={handlePinSuccess}
        onClose={() => setShowPinModal(false)}
      />
    </div>
  );
}
