import React from 'react';
import { 
  ShoppingCart, 
  PauseCircle, 
  QrCode, 
  CheckCheck, 
  Package, 
  Clock, 
  BarChart3, 
  Users, 
  ShieldCheck, 
  Settings, 
  LogOut,
  Wifi,
  WifiOff,
  Store
} from 'lucide-react';
import useOfflineStatus from '../useOfflineStatus';

export default function Navbar({ activeTab, setActiveTab, user, onLogout, heldBillsCount = 0, openTicketsCount = 0, lowStockCount = 0 }) {
  const isOwner = user?.role === 'owner';
  const isManager = user?.role === 'manager' || isOwner;
  const { isOnline, pendingCount } = useOfflineStatus();

  const navItems = [
    { id: 'pos', label: 'Kasir POS', icon: ShoppingCart, role: 'all' },
    { id: 'held', label: 'Hold Bill', icon: PauseCircle, role: 'all', badge: heldBillsCount },
    { id: 'ledger', label: 'Ledger QRIS', icon: QrCode, role: 'all' },
    { id: 'reconcile', label: 'Rekonsiliasi', icon: CheckCheck, role: 'manager', badge: openTicketsCount, badgeColor: 'bg-rose-500' },
    { id: 'products', label: 'Stok & Produk', icon: Package, role: 'all', badge: lowStockCount, badgeColor: 'bg-amber-500' },
    { id: 'shifts', label: 'Shift Kasir', icon: Clock, role: 'all' },
    { id: 'reports', label: 'Laporan', icon: BarChart3, role: 'manager' },
    { id: 'customers', label: 'Pelanggan CRM', icon: Users, role: 'all' },
    { id: 'audit', label: 'Audit Log', icon: ShieldCheck, role: 'manager' },
    { id: 'settings', label: 'Pengaturan', icon: Settings, role: 'owner' },
  ];

  const filteredItems = navItems.filter(item => {
    if (item.role === 'all') return true;
    if (item.role === 'manager') return isManager;
    if (item.role === 'owner') return isOwner;
    return false;
  });

  const getRoleBadge = (role) => {
    switch (role) {
      case 'owner':
        return <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Owner</span>;
      case 'manager':
        return <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Manajer</span>;
      default:
        return <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Kasir</span>;
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-700 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base text-slate-900 leading-none">POS QRIS Auto-Reconcile</h1>
                <span
                  className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                    isOnline
                      ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                      : 'text-amber-700 bg-amber-50 border-amber-300'
                  }`}
                  title={isOnline ? 'Terhubung ke server' : 'Mode offline: transaksi disimpan di perangkat'}
                >
                  {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {isOnline ? 'Online Web' : 'Offline'}
                </span>
                {pendingCount > 0 && (
                  <span
                    className="flex items-center gap-1 text-[11px] font-bold text-white bg-amber-500 px-2 py-0.5 rounded-full"
                    title="Transaksi menunggu sinkronisasi"
                  >
                    {pendingCount} antrean
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                <Store className="w-3 h-3 text-slate-400" />
                <span>{user?.outlet_name || 'Toko Berkah Mandiri (Outlet Utama)'}</span>
              </p>
            </div>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-sm font-semibold text-slate-800">{user?.full_name}</span>
                {getRoleBadge(user?.role)}
              </div>
              <p className="text-xs text-slate-400">@{user?.username}</p>
            </div>

            <button
              onClick={onLogout}
              title="Keluar"
              className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Navigation Menu Tabs */}
        <div className="flex space-x-1 overflow-x-auto py-1 scrollbar-none border-t border-slate-100">
          {filteredItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition relative ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/30'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{item.label}</span>
                {item.badge > 0 && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold text-white ${
                      item.badgeColor || 'bg-brand-800'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
