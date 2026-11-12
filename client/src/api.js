const API_BASE = '/api';

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
    err.data = data;
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

// SSE Connection Listener
export function subscribeToQrisEvents(onPaid, onExpired) {
  const es = new EventSource('/api/qris/events');

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
