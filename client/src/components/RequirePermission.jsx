import React from 'react';
import { useSession } from '../context/SessionContext';

/**
 * UI-level permission gate. Render nothing (or a custom fallback) when the
 * active session lacks the required permission / role. Never rely on this for
 * security: every sensitive endpoint is also guarded server-side.
 */
export function RequirePermission({ permission, anyOf, role, fallback = null, children }) {
  const { hasPermission, hasAnyPermission, hasRole } = useSession();

  let allowed = true;
  if (permission) allowed = allowed && hasPermission(permission);
  if (anyOf && anyOf.length > 0) allowed = allowed && hasAnyPermission(anyOf);
  if (role) allowed = allowed && hasRole(role);

  if (!allowed) return fallback;
  return <>{children}</>;
}

/**
 * HOC variant for protecting an entire view or component tree.
 *
 *   export default withPermission('users.manage', StaffView);
 */
export function withPermission(permission, Component, options = {}) {
  function GuardedComponent(props) {
    return (
      <RequirePermission permission={permission} fallback={options.fallback ?? null}>
        <Component {...props} />
      </RequirePermission>
    );
  }

  GuardedComponent.displayName = `withPermission(${Component.displayName || Component.name || 'Component'})`;
  return GuardedComponent;
}

export default RequirePermission;
