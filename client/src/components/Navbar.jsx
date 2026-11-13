import React from 'react';
import { QrCode, LogOut, Wifi, WifiOff } from 'lucide-react';
import useOfflineStatus from '../useOfflineStatus';
import { useSession } from '../context/SessionContext';
import { NAV_ITEMS } from '../navigation';
import OutletSwitcher from './OutletSwitcher';

function RoleBadge({ role }) {
  switch (role) {
    case 'owner':
      return <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Owner</span>;
    case 'manager':
      return <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Manajer</span>;
    default:
      return <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Kasir</span>;
  }
}

export default function Navbar({
  activeTab,
  setActiveTab,
  onLogout,
  heldBillsCount = 0,
  openTicketsCount = 0,
  lowStockCount = 0
}) {
  const { user, hasPermission } = useSession();
  const { isOnline, pendingCount } = useOfflineStatus();

  const badgeValues = { heldBillsCount, openTicketsCount, lowStockCount };

  // Tabs are driven by the permission matrix returned by the server, never by
  // a hard-coded role comparison.
  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(item.permission));

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Brand */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-700 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20 shrink-0">
              <QrCode className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base text-slate-900 leading-none truncate">
                  POS QRIS Auto-Reconcile
                </h1>
                <span
                  className={`hidden sm:flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
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
              <div className="mt-1">
                <OutletSwitcher />
              </div>
            </div>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-sm font-semibold text-slate-800">{user?.full_name}</span>
                <RoleBadge role={user?.role} />
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
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const badge = item.badgeKey ? badgeValues[item.badgeKey] : 0;
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
                {badge > 0 && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold text-white ${
                      item.badgeColor || 'bg-brand-800'
                    }`}
                  >
                    {badge}
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
