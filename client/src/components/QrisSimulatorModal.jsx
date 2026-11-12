import React, { useState, useEffect } from 'react';
import { QrCode, CheckCircle2, Clock, Smartphone, AlertCircle, ArrowRight, RefreshCw, X } from 'lucide-react';
import { apiRequest, formatRupiah } from '../api';

export default function QrisSimulatorModal({ isOpen, qrisData, onPaidSuccess, onClose }) {
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [selectedWallet, setSelectedWallet] = useState('BCA Mobile');
  const [simulating, setSimulating] = useState(false);
  const [paidStatus, setPaidStatus] = useState(false);
  const [paidDetails, setPaidDetails] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !qrisData) return;

    setTimeLeft(300);
    setPaidStatus(false);
    setPaidDetails(null);
    setError('');

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, qrisData]);

  if (!isOpen || !qrisData) return null;

  const formatTimer = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSimulatePayment = async () => {
    setSimulating(true);
    setError('');
    try {
      const res = await apiRequest('/qris/simulate-pay', {
        method: 'POST',
        body: JSON.stringify({
          transaction_ref: qrisData.transaction_ref,
          customer_bank: selectedWallet
        })
      });

      if (res.success) {
        setPaidStatus(true);
        setPaidDetails({
          bank: selectedWallet,
          rrn: res.issuer_ref,
          amount: qrisData.amount
        });
        setTimeout(() => {
          if (onPaidSuccess) {
            onPaidSuccess({
              order_id: qrisData.order_id,
              transaction_ref: qrisData.transaction_ref,
              amount: qrisData.amount,
              rrn: res.issuer_ref,
              bank: selectedWallet
            });
          }
        }, 1200);
      }
    } catch (err) {
      setError(err.message || 'Gagal memproses simulasi pembayaran QRIS');
    } finally {
      setSimulating(false);
    }
  };

  const paymentSources = [
    { name: 'BCA Mobile', color: 'bg-blue-600' },
    { name: 'Livin Mandiri', color: 'bg-amber-600' },
    { name: 'BRImo', color: 'bg-blue-800' },
    { name: 'GoPay', color: 'bg-cyan-600' },
    { name: 'OVO', color: 'bg-purple-600' },
    { name: 'ShopeePay', color: 'bg-orange-600' },
    { name: 'DANA', color: 'bg-sky-500' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-700 to-indigo-800 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm">
              <QrCode className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg">QRIS Dinamis Bank Indonesia</h3>
                <span className="text-[10px] uppercase font-bold bg-emerald-400 text-slate-900 px-2 py-0.5 rounded-full">
                  Real-time
                </span>
              </div>
              <p className="text-xs text-indigo-200">Nominal terkunci otomatis & siap dipindai</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {paidStatus ? (
            /* Success State */
            <div className="py-8 text-center space-y-4 animate-in zoom-in-90 duration-300">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-12 h-12" />
              </div>
              <div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider">
                  Pembayaran Terverifikasi (Lunas)
                </span>
                <h4 className="text-2xl font-black text-slate-900 mt-2">
                  {formatRupiah(paidDetails?.amount)}
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Sumber Dana: <span className="font-semibold text-slate-800">{paidDetails?.bank}</span>
                </p>
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  Trace RRN: {paidDetails?.rrn}
                </p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 font-medium">
                Sistem mendeteksi webhook PJP dalam &lt; 1 detik. Struk sedang disiapkan...
              </div>
            </div>
          ) : (
            /* Active QRIS Presentation & Simulator */
            <div>
              <div className="flex flex-col items-center justify-center">
                {/* Amount Pill */}
                <div className="text-center mb-3">
                  <span className="text-xs font-medium text-slate-500">Total Nominal Terkunci:</span>
                  <div className="text-3xl font-extrabold text-slate-900">
                    {formatRupiah(qrisData.amount)}
                  </div>
                </div>

                {/* QR Code Container */}
                <div className="p-3 bg-white rounded-2xl shadow-lg border-2 border-slate-200 flex flex-col items-center relative">
                  {qrisData.qr_data_url ? (
                    <img
                      src={qrisData.qr_data_url}
                      alt="QRIS Dinamis"
                      className="w-56 h-56 rounded-lg object-contain"
                    />
                  ) : (
                    <div className="w-56 h-56 bg-slate-100 flex items-center justify-center text-slate-400">
                      Membuat QR...
                    </div>
                  )}

                  {/* QRIS Logo Bar */}
                  <div className="w-full mt-2 pt-2 border-t border-slate-100 flex items-center justify-between px-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    <span>QRIS Standard BI</span>
                    <span className="text-brand-600 font-mono">GPN / ASPI</span>
                  </div>
                </div>

                {/* Countdown Timer */}
                <div className="mt-3 flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
                  <Clock className={`w-4 h-4 ${timeLeft < 60 ? 'text-rose-500 animate-pulse' : 'text-slate-500'}`} />
                  <span>Masa Berlaku: <span className="font-mono text-slate-900">{formatTimer(timeLeft)}</span></span>
                  {timeLeft === 0 && <span className="text-rose-600 font-bold">(Kedaluwarsa)</span>}
                </div>
              </div>

              {/* Simulation Section */}
              <div className="mt-6 pt-5 border-t border-slate-200 bg-slate-50 -mx-6 -mb-6 p-6 rounded-b-3xl">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="w-4 h-4 text-brand-600" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Simulasi Pembayaran Pelanggan
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-3">
                  Pilih aplikasi bank/e-wallet untuk menguji verifikasi webhook PJP & rekonsiliasi otomatis secara instan:
                </p>

                <div className="grid grid-cols-4 gap-2 mb-4">
                  {paymentSources.map((source) => (
                    <button
                      key={source.name}
                      type="button"
                      onClick={() => setSelectedWallet(source.name)}
                      className={`p-2 rounded-xl text-center text-xs font-semibold border transition ${
                        selectedWallet === source.name
                          ? 'bg-brand-600 text-white border-brand-600 shadow-sm ring-2 ring-brand-300'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {source.name}
                    </button>
                  ))}
                </div>

                {error && (
                  <div className="mb-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2 rounded-lg flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSimulatePayment}
                  disabled={simulating || timeLeft === 0}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition active:scale-[0.99]"
                >
                  {simulating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Mengirim Webhook PJP & Memverifikasi...</span>
                    </>
                  ) : (
                    <>
                      <span>Bayar via {selectedWallet} (Simulasi &lt; 2s)</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
