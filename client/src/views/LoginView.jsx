import React, { useState } from 'react';
import { QrCode, Lock, User, ArrowRight, ShieldCheck, CheckCircle2, Zap } from 'lucide-react';
import { apiRequest, setToken, setUser } from '../api';

export default function LoginView({ onLoginSuccess }) {
  const [username, setUsername] = useState('kasir');
  const [password, setPassword] = useState('kasir123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      setToken(res.token);
      setUser(res.user);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message || 'Gagal masuk. Periksa kembali username dan password.');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (u, p) => {
    setUsername(u);
    setPassword(p);
    // directly execute login
    setLoading(true);
    setError('');
    apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: u, password: p })
    })
      .then(res => {
        setToken(res.token);
        setUser(res.user);
        onLoginSuccess(res.user);
      })
      .catch(err => {
        setError(err.message || 'Gagal masuk');
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-tr from-brand-600 to-indigo-500 rounded-3xl mx-auto flex items-center justify-center text-white shadow-xl shadow-brand-500/30 mb-4">
            <QrCode className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">POS Toko Web & QRIS</h2>
          <p className="text-sm text-slate-400 mt-1">Sistem Kasir & Rekonsiliasi QRIS Otomatis</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 border border-slate-100">
          <h3 className="text-base font-bold text-slate-800 mb-1">Masuk ke Sistem</h3>
          <p className="text-xs text-slate-500 mb-5">Pilih akun demonstrasi atau ketik kredensial</p>

          {/* Quick Demo Selector */}
          <div className="mb-5 p-3 bg-slate-50 rounded-2xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Akses Cepat (Demo Role):
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => quickLogin('kasir', 'kasir123')}
                disabled={loading}
                className="py-2 px-1 text-center bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl transition text-xs font-semibold text-slate-700 active:scale-95"
              >
                <span className="block text-emerald-600 font-bold">Kasir</span>
                <span className="text-[10px] text-slate-400">Kasir POS</span>
              </button>
              <button
                type="button"
                onClick={() => quickLogin('manager', 'manager123')}
                disabled={loading}
                className="py-2 px-1 text-center bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl transition text-xs font-semibold text-slate-700 active:scale-95"
              >
                <span className="block text-blue-600 font-bold">Manajer</span>
                <span className="text-[10px] text-slate-400">PIN: 654321</span>
              </button>
              <button
                type="button"
                onClick={() => quickLogin('owner', 'owner123')}
                disabled={loading}
                className="py-2 px-1 text-center bg-white hover:bg-purple-50 border border-slate-200 hover:border-purple-300 rounded-xl transition text-xs font-semibold text-slate-700 active:scale-95"
              >
                <span className="block text-purple-600 font-bold">Owner</span>
                <span className="text-[10px] text-slate-400">PIN: 123456</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
                  placeholder="Masukkan username"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
                  placeholder="Masukkan password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-md shadow-brand-500/20 flex items-center justify-center gap-2 transition active:scale-[0.99] mt-2"
            >
              <span>{loading ? 'Memproses...' : 'Masuk ke POS'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Features badge list */}
          <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>QRIS Dinamis Otomatis</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Rekonsiliasi Settlement</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Tutup Shift & Opname</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>100% Akses Web & PWA</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
