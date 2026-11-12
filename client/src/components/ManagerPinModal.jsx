import React, { useState } from 'react';
import { Lock, X, AlertTriangle } from 'lucide-react';
import { apiRequest } from '../api';

export default function ManagerPinModal({ isOpen, title = 'Otorisasi PIN Manajer', description = 'Masukkan 6 digit PIN Manajer untuk mengonfirmasi tindakan ini.', onSuccess, onClose }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleDigit = (digit) => {
    if (pin.length < 6) {
      setPin(prev => prev + digit);
      setError('');
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const handleVerify = async (pinToVerify = pin) => {
    if (pinToVerify.length < 6) {
      setError('PIN harus 6 digit');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await apiRequest('/auth/verify-pin', {
        method: 'POST',
        headers: { 'x-manager-pin': pinToVerify },
        body: JSON.stringify({ manager_pin: pinToVerify })
      });

      if (res.success) {
        setPin('');
        onSuccess(pinToVerify, res.manager);
      }
    } catch (err) {
      setError(err.message || 'PIN Manajer salah');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base leading-tight">{title}</h3>
              <p className="text-xs text-slate-400">Tindakan terlindungi otorisasi</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 text-center">
          <p className="text-xs text-slate-500 mb-4">{description}</p>

          {/* PIN Indicators */}
          <div className="flex justify-center gap-3 mb-4">
            {[0, 1, 2, 3, 4, 5].map((idx) => (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full border-2 transition-all ${
                  idx < pin.length
                    ? 'bg-brand-600 border-brand-600 scale-110'
                    : 'border-slate-300 bg-slate-100'
                }`}
              />
            ))}
          </div>

          {error && (
            <div className="mb-4 flex items-center justify-center gap-1.5 text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 py-2 px-3 rounded-lg">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto mb-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleDigit(String(num))}
                disabled={loading}
                className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-lg font-bold text-slate-800 transition active:scale-95"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              disabled={loading}
              className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-600 active:scale-95"
            >
              C
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              disabled={loading}
              className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-lg font-bold text-slate-800 active:scale-95"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-600 active:scale-95"
            >
              ⌫
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => handleVerify()}
              disabled={loading || pin.length < 6}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium text-sm shadow-sm transition"
            >
              {loading ? 'Memeriksa...' : 'Konfirmasi PIN'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">Demo PIN Manajer: <span className="font-mono font-bold text-slate-600">654321</span> atau Owner: <span className="font-mono font-bold text-slate-600">123456</span></p>
        </div>
      </div>
    </div>
  );
}
