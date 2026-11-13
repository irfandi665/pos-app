import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { getActiveOutletId, setActiveOutletId as persistActiveOutletId } from '../api';
import { resolvePermissions } from '../permissions';

const SessionContext = createContext(null);

function pickInitialOutletId(user, outlets) {
  const stored = getActiveOutletId();
  if (stored && outlets.some((outlet) => outlet.id === stored && outlet.is_active !== false)) {
    return stored;
  }

  const preferred = user?.active_outlet_id || user?.outlet_id;
  if (preferred && outlets.some((outlet) => outlet.id === preferred)) {
    return preferred;
  }

  const firstActive = outlets.find((outlet) => outlet.is_active !== false);
  return firstActive ? firstActive.id : (outlets[0]?.id || null);
}

export function SessionProvider({ user, children }) {
  const outlets = useMemo(() => user?.outlets || [], [user]);
  const permissions = useMemo(() => resolvePermissions(user), [user]);
  const [activeOutletId, setActiveOutletIdState] = useState(() => pickInitialOutletId(user, outlets));

  // Reset the selection whenever a different user signs in.
  useEffect(() => {
    setActiveOutletIdState(pickInitialOutletId(user, outlets));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    persistActiveOutletId(activeOutletId);
  }, [activeOutletId]);

  const activeOutlet = useMemo(
    () => outlets.find((outlet) => outlet.id === activeOutletId) || null,
    [outlets, activeOutletId]
  );

  const hasPermission = useCallback(
    (permission) => {
      if (!permission) return true;
      return permissions.includes(permission);
    },
    [permissions]
  );

  const hasAnyPermission = useCallback(
    (requiredPermissions) => {
      if (!requiredPermissions || requiredPermissions.length === 0) return true;
      return requiredPermissions.some((permission) => permissions.includes(permission));
    },
    [permissions]
  );

  const hasRole = useCallback(
    (roles) => {
      const list = Array.isArray(roles) ? roles : [roles];
      return list.includes(user?.role);
    },
    [user?.role]
  );

  const switchOutlet = useCallback(
    (outletId) => {
      const numericId = Number(outletId);
      const target = outlets.find((outlet) => outlet.id === numericId);
      if (!target || target.is_active === false) return false;

      persistActiveOutletId(numericId);
      setActiveOutletIdState(numericId);
      return true;
    },
    [outlets]
  );

  const value = useMemo(
    () => ({
      user,
      permissions,
      outlets,
      activeOutlet,
      activeOutletId: activeOutlet ? activeOutlet.id : null,
      hasPermission,
      hasAnyPermission,
      hasRole,
      switchOutlet,
      canSwitchOutlet: outlets.length > 1
    }),
    [
      user,
      permissions,
      outlets,
      activeOutlet,
      hasPermission,
      hasAnyPermission,
      hasRole,
      switchOutlet
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession harus digunakan di dalam SessionProvider');
  }
  return context;
}

export default SessionContext;
