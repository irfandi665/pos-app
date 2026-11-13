import React, { useState, useEffect } from 'react';
import { getToken, getUser, setToken, setUser, apiRequest, SESSION_EXPIRED_EVENT } from './api';
import Navbar from './components/Navbar';
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

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => (getToken() ? getUser() : null));
  const [booting, setBooting] = useState(() => Boolean(getToken()));
  const [activeTab, setActiveTab] = useState('pos');
  const [heldBillsCount, setHeldBillsCount] = useState(0);
  const [openTicketsCount, setOpenTicketsCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [resumedBill, setResumedBill] = useState(null);

  // Validate the stored JWT on boot. An expired token must never leave the POS
  // shell usable after a page reload.
  useEffect(() => {
    let cancelled = false;

    const handleSessionExpired = () => {
      setCurrentUser(null);
      setActiveTab('pos');
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);

    const validateSession = async () => {
      if (!getToken()) {
        setToken(null);
        setUser(null);
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

  const fetchBadges = async () => {
    if (!getToken()) return;
    try {
      const [heldRes, ticketsRes, prodRes] = await Promise.all([
        apiRequest('/orders/held/list').catch(() => ({ heldOrders: [] })),
        apiRequest('/reconcile/tickets?status=OPEN').catch(() => ({ tickets: [] })),
        apiRequest('/products?low_stock=true').catch(() => ({ products: [] }))
      ]);

      setHeldBillsCount(heldRes.heldOrders?.length || 0);
      setOpenTicketsCount(ticketsRes.tickets?.length || 0);
      setLowStockCount(prodRes.products?.length || 0);
    } catch (e) {
      // badge fetch error ignored
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchBadges();
      const interval = setInterval(fetchBadges, 15000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setCurrentUser(null);
    setActiveTab('pos');
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setActiveTab('pos');
    fetchBadges();
  };

  const handleResumeBill = (bill) => {
    setResumedBill(bill);
    setActiveTab('pos');
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
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={currentUser}
        onLogout={handleLogout}
        heldBillsCount={heldBillsCount}
        openTicketsCount={openTicketsCount}
        lowStockCount={lowStockCount}
      />

      <main className="flex-1 pb-12">
        {activeTab === 'pos' && (
          <PosView
            user={currentUser}
            resumedBill={resumedBill}
            onBillHeld={() => fetchBadges()}
          />
        )}
        {activeTab === 'held' && (
          <HoldBillsView
            onResumeBill={handleResumeBill}
          />
        )}
        {activeTab === 'ledger' && (
          <QrisLedgerView />
        )}
        {activeTab === 'reconcile' && (
          <ReconcileView
            user={currentUser}
          />
        )}
        {activeTab === 'products' && (
          <ProductsView
            user={currentUser}
          />
        )}
        {activeTab === 'shifts' && (
          <ShiftsView
            user={currentUser}
          />
        )}
        {activeTab === 'reports' && (
          <ReportsView />
        )}
        {activeTab === 'customers' && (
          <CustomersView />
        )}
        {activeTab === 'audit' && (
          <AuditView />
        )}
        {activeTab === 'settings' && (
          <SettingsView
            user={currentUser}
          />
        )}
      </main>
    </div>
  );
}
