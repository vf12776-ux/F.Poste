const API_BASE = '';

function getToken(): string | null {
  return localStorage.getItem('fposte_token');
}

export function setToken(token: string) {
  localStorage.setItem('fposte_token', token);
}

export function clearToken() {
  localStorage.removeItem('fposte_token');
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  
  const res = await fetch(API_BASE + path, {
    ...options,
    headers,
  });
  
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('Unauthorized');
  }
  
  return res;
}

export async function login(username: string, displayName: string) {
  const res = await apiFetch('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, displayName }),
  });
  if (!res.ok) throw new Error('Login failed');
  return res.json();
}

export async function getMe() {
  const res = await apiFetch('/api/me');
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}