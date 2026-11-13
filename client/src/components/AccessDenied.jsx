import React from 'react';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';

export default function AccessDenied({ title = 'Akses ditolak', message, onBack, backLabel = 'Kembali ke Kasir' }) {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
      <div className="bg-white border border-rose-200 rounded-3xl shadow-xs p-8 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500 mt-2">
          {message || 'Sesi Anda tidak memiliki izin untuk membuka halaman ini. Hubungi Owner jika Anda membutuhkan akses.'}
        </p>
        <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-slate-400">
          <Lock className="w-3.5 h-3.5" />
          Permintaan tetap divalidasi ulang oleh server
        </p>
        {onBack && (
          <div className="mt-6">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition"
            >
              <ArrowLeft className="w-4 h-4" />
              {backLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
