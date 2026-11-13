const API_BASE = '/api';
const AUTH_ERROR_CODES = new Set(['AUTH_TOKEN_MISSING', 'AUTH_TOKEN_INVALID']);
const OUTLET_STORAGE_KEY = 'pos_active_outlet_id';
export const SESSION_EXPIRED_EVENT = 'pos-session-expired';
export const ACCESS_DENIED_EVENT = 'pos-access-denied';

export function getToken() {
  return localStorage.getItem('pos_token') || '';
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('pos_token', token);
  } else {
    localStorage.removeItem('pos_token');
  }
}

export function getActiveOutletId() {
  const raw = localStorage.getItem(OUTLET_STORAGE_KEY);
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function setActiveOutletId(outletId) {
  if (outletId) {
    localStorage.setItem(OUTLET_STORAGE_KEY, String(outletId));
  } else {
    localStorage.removeItem(OUTLET_STORAGE_KEY);
  }
}


export function getUser() {
  try {
    const raw = localStorage.getItem('pos_user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function setUser(user) {
  if (user) {
    localStorage.setItem('pos_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('pos_user');
  }
}

export async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // The active outlet is injected into every request so the backend can scope
  // queries and reject access to outlets the session is not authorized for.
  const activeOutletId = getActiveOutletId();
  if (activeOutletId && !options.skipOutletHeader) {
    headers['X-Outlet-Id'] = String(activeOutletId);
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const errorMsg = data && data.error ? data.error : `HTTP ${res.status}: ${res.statusText}`;
    const err = new Error(errorMsg);
    err.status = res.status;
    err.code = data && data.code;
    err.details = data && data.details;
    err.permission = data && data.permission;
    err.data = data;
    err.isAuthError = res.status === 401 || AUTH_ERROR_CODES.has(err.code);
    err.isForbidden = res.status === 403 && !err.isAuthError;

    // A missing/expired token means the cached session is no longer valid.
    // Clear it once and notify the app shell so it returns to the login view.
    if (err.isAuthError) {
      const hadSession = Boolean(getToken() || getUser());
      setToken(null);
      setUser(null);
      setActiveOutletId(null);

      if (hadSession && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, {
          detail: { message: errorMsg, status: res.status, code: err.code }
        }));
      }
    } else if (err.isForbidden && typeof window !== 'undefined') {
      // A valid session that lacks a permission or outlet grant stays signed in,
      // but the shell is notified so it can show an access-denied notice.
      window.dispatchEvent(new CustomEvent(ACCESS_DENIED_EVENT, {
        detail: { message: errorMsg, code: err.code, permission: err.permission }
      }));
    }

    throw err;
  }

  return data;
}

export function formatRupiah(number) {
  const num = parseInt(number || 0, 10);
  return 'Rp ' + num.toLocaleString('id-ID');
}

export function formatDateTime(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return isoString;
  }
}

// SSE Connection Listener. EventSource cannot send custom headers, so the
// active outlet is passed as a query parameter instead.
export function subscribeToQrisEvents(onPaid, onExpired) {
  const activeOutletId = getActiveOutletId();
  const streamUrl = activeOutletId
    ? `/api/qris/events?outlet_id=${encodeURIComponent(activeOutletId)}`
    : '/api/qris/events';
  const es = new EventSource(streamUrl);

  es.addEventListener('qris_paid', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (onPaid) onPaid(data);
    } catch (e) {
      console.error('Error parsing SSE event:', e);
    }
  });

  es.addEventListener('qris_expired', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (onExpired) onExpired(data);
    } catch (e) {
      console.error('Error parsing SSE event:', e);
    }
  });

  return es;
}
