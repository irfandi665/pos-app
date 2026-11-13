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
  Store,
  UserCog
} from 'lucide-react';

/**
 * Single source of truth for the tab shell. Every entry is gated by one RBAC
 * permission; the server re-validates the matching API calls regardless.
 */
export const NAV_ITEMS = [
  { id: 'pos', label: 'Kasir POS', icon: ShoppingCart, permission: 'pos.checkout' },
  {
    id: 'held',
    label: 'Hold Bill',
    icon: PauseCircle,
    permission: 'pos.hold_bill',
    badgeKey: 'heldBillsCount'
  },
  { id: 'ledger', label: 'Ledger QRIS', icon: QrCode, permission: 'qris.view' },
  {
    id: 'products',
    label: 'Stok & Produk',
    icon: Package,
    permission: 'products.view',
    badgeKey: 'lowStockCount',
    badgeColor: 'bg-amber-500'
  },
  { id: 'shifts', label: 'Shift Kasir', icon: Clock, permission: 'shifts.manage_own' },
  { id: 'customers', label: 'Pelanggan CRM', icon: Users, permission: 'customers.view' },
  {
    id: 'reconcile',
    label: 'Rekonsiliasi',
    icon: CheckCheck,
    permission: 'reconcile.manage',
    badgeKey: 'openTicketsCount',
    badgeColor: 'bg-rose-500'
  },
  { id: 'reports', label: 'Laporan', icon: BarChart3, permission: 'reports.view' },
  { id: 'audit', label: 'Audit Log', icon: ShieldCheck, permission: 'audit.view' },
  { id: 'outlets', label: 'Outlet', icon: Store, permission: 'outlets.view' },
  { id: 'staff', label: 'Staf', icon: UserCog, permission: 'users.view' },
  { id: 'roles', label: 'Peran & Izin', icon: ShieldCheck, permission: 'roles.view' },
  { id: 'settings', label: 'Pengaturan', icon: Settings, permission: 'settings.manage' }
];

export const TAB_PERMISSIONS = NAV_ITEMS.reduce((accumulator, item) => {
  accumulator[item.id] = item.permission;
  return accumulator;
}, {});

export default NAV_ITEMS;
