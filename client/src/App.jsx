import React, { useCallback, useEffect, useState } from 'react';
import {
  getToken,
  getUser,
  setToken,
  setUser,
  apiRequest,
  setActiveOutletId,
  SESSION_EXPIRED_EVENT,
  ACCESS_DENIED_EVENT
} from './api';
import { SessionProvider, useSession } from './context/SessionContext';
import { NAV_ITEMS, TAB_PERMISSIONS } from './navigation';
import Navbar from './components/Navbar';
import AccessDenied from './components/AccessDenied';
import { ShieldAlert, X } from 'lucide-react';
import LoginView from './views/LoginView';
import PosView from './views/PosView';
import HoldBillsView from './views/HoldBillsView';
import QrisLedgerView from './views/QrisLedgerView';
import ReconcileView from './views/ReconcileView';
import ProductsView from './views/ProductsView';
import ShiftsView from './views/ShiftsView';
import ReportsView from './views/ReportsView';
import CustomersView from './views/CustomersView';
import AuditView from './views/AuditView';
import SettingsView from './views/SettingsView';
import OutletsView from './views/OutletsView';
import StaffView from './views/StaffView';
import RolesView from './views/RolesView';

function AccessDeniedToast({ notice, onDismiss }) {
  if (!notice) return null;

  return (
    <div className="fixed top-4 right-4 z-[60] w-[calc(100vw-2rem)] max-w-sm">
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-rose-200 shadow-lg shadow-rose-500/10">
        <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-900">Akses ditolak</p>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{notice}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Tutup notifikasi"
          className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Authenticated shell. Lives inside SessionProvider so every view and the
 * navbar share the same permissions and active outlet.
 */
function AppShell({ currentUser, onLogout }) {
  const { hasPermission, activeOutletId } = useSession();
  const [activeTab, setActiveTab] = useState('pos');
  const [heldBillsCount, setHeldBillsCount] = useState(0);
  const [openTicketsCount, setOpenTicketsCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [resumedBill, setResumedBill] = useState(null);
  const [accessNotice, setAccessNotice] = useState('');

  // Global 403 handling: a valid session that lacks a permission stays signed
  // in, but the user is told why the action failed.
  useEffect(() => {
    const handleAccessDenied = (event) => {
      setAccessNotice(
        event?.detail?.message
          || 'Peran Anda tidak memiliki izin untuk tindakan ini.'
      );
    };

    window.addEventListener(ACCESS_DENIED_EVENT, handleAccessDenied);
    return () => window.removeEventListener(ACCESS_DENIED_EVENT, handleAccessDenied);
  }, []);

  useEffect(() => {
    if (!accessNotice) return undefined;
    const timer = setTimeout(() => setAccessNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [accessNotice]);

  // Never keep a tab the current permission set can no longer render.
  useEffect(() => {
    if (hasPermission(TAB_PERMISSIONS[activeTab])) return;
    const fallback = NAV_ITEMS.find((item) => hasPermission(item.permission));
    setActiveTab(fallback ? fallback.id : 'pos');
  }, [activeTab, hasPermission]);

  // Bills belong to an outlet; switching outlets must clear the resume draft.
  useEffect(() => {
    setResumedBill(null);
  }, [activeOutletId]);

  const fetchBadges = useCallback(async () => {
    if (!getToken()) return;

    const nextCounts = { held: 0, tickets: 0, lowStock: 0 };
    const tasks = [];

    if (hasPermission('pos.hold_bill')) {
      tasks.push(
        apiRequest('/orders/held/list')
          .then((response) => { nextCounts.held = response.heldOrders?.length || 0; })
          .catch(() => {})
      );
    }
    if (hasPermission('reconcile.manage')) {
      tasks.push(
        apiRequest('/reconcile/tickets?status=OPEN')
          .then((response) => { nextCounts.tickets = response.tickets?.length || 0; })
          .catch(() => {})
      );
    }
    if (hasPermission('products.view')) {
      tasks.push(
        apiRequest('/products?low_stock=true')
          .then((response) => { nextCounts.lowStock = response.products?.length || 0; })
          .catch(() => {})
      );
    }

    await Promise.allSettled(tasks);
    setHeldBillsCount(nextCounts.held);
    setOpenTicketsCount(nextCounts.tickets);
    setLowStockCount(nextCounts.lowStock);
  }, [hasPermission]);

  useEffect(() => {
    fetchBadges();
    const interval = setInterval(fetchBadges, 15000);
    return () => clearInterval(interval);
  }, [fetchBadges, activeOutletId]);

  const handleResumeBill = (bill) => {
    setResumedBill(bill);
    setActiveTab('pos');
  };

  const handleTabChange = (tab) => {
    if (!hasPermission(TAB_PERMISSIONS[tab])) {
      setAccessNotice('Peran Anda tidak memiliki izin untuk membuka halaman tersebut.');
      return;
    }
    setActiveTab(tab);
  };

  const renderView = () => {
    if (!hasPermission(TAB_PERMISSIONS[activeTab])) {
      return (
        <AccessDenied
          title="Halaman tidak dapat diakses"
          message="Peran Anda tidak memiliki izin untuk membuka halaman ini. Hubungi Owner untuk menyesuaikan matriks izin."
          onBack={() => {
            const fallback = NAV_ITEMS.find((item) => hasPermission(item.permission));
            setActiveTab(fallback ? fallback.id : 'pos');
          }}
        />
      );
    }

    switch (activeTab) {
      case 'pos':
        return (
          <PosView
            user={currentUser}
            resumedBill={resumedBill}
            onBillHeld={() => fetchBadges()}
          />
        );
      case 'held':
        return <HoldBillsView onResumeBill={handleResumeBill} />;
      case 'ledger':
        return <QrisLedgerView />;
      case 'reconcile':
        return <ReconcileView user={currentUser} />;
      case 'products':
        return <ProductsView user={currentUser} />;
      case 'shifts':
        return <ShiftsView user={currentUser} />;
      case 'reports':
        return <ReportsView />;
      case 'customers':
        return <CustomersView />;
      case 'audit':
        return <AuditView />;
      case 'outlets':
        return <OutletsView />;
      case 'staff':
        return <StaffView />;
      case 'roles':
        return <RolesView />;
      case 'settings':
        return <SettingsView user={currentUser} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        onLogout={onLogout}
        heldBillsCount={heldBillsCount}
        openTicketsCount={openTicketsCount}
        lowStockCount={lowStockCount}
      />

      <main key={activeOutletId || 'no-outlet'} className="flex-1 pb-12">
        {renderView()}
      </main>

      <AccessDeniedToast notice={accessNotice} onDismiss={() => setAccessNotice('')} />
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => (getToken() ? getUser() : null));
  const [booting, setBooting] = useState(() => Boolean(getToken()));

  // Validate the stored JWT on boot. An expired token must never leave the POS
  // shell usable after a page reload.
  useEffect(() => {
    let cancelled = false;

    const handleSessionExpired = () => {
      setCurrentUser(null);
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);

    const validateSession = async () => {
      if (!getToken()) {
        setToken(null);
        setUser(null);
        setActiveOutletId(null);
        if (!cancelled) {
          setCurrentUser(null);
          setBooting(false);
        }
        return;
      }

      try {
        const response = await apiRequest('/auth/me');
        if (!cancelled) {
          setUser(response.user);
          setCurrentUser(response.user);
        }
      } catch (error) {
        // Keep the cached identity on network errors so offline cash sales
        // remain possible. Auth errors have already been cleared by apiRequest.
        if (!cancelled) {
          setCurrentUser(error.status === 401 || error.status === 403 ? null : getUser());
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    };

    validateSession();

    return () => {
      cancelled = true;
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, []);

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setActiveOutletId(null);
    setCurrentUser(null);
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-3 text-slate-300">
        <div className="w-10 h-10 border-4 border-slate-700 border-t-brand-500 rounded-full animate-spin" />
        <p className="text-sm font-medium">Memeriksa sesi...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <SessionProvider user={currentUser}>
      <AppShell currentUser={currentUser} onLogout={handleLogout} />
    </SessionProvider>
  );
}
