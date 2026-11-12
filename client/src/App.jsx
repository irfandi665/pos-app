import React, { useState, useEffect } from 'react';
import { getToken, getUser, setToken, setUser, apiRequest } from './api';
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
  const [currentUser, setCurrentUser] = useState(getUser());
  const [activeTab, setActiveTab] = useState('pos');
  const [heldBillsCount, setHeldBillsCount] = useState(0);
  const [openTicketsCount, setOpenTicketsCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [resumedBill, setResumedBill] = useState(null);

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
