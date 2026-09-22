const API_BASE = '';

export function setToken(token: string) {
  localStorage.setItem('fposte_token', token);
}

export function getToken(): string | null {
  return localStorage.getItem('fposte_token');
}

export function clearToken() {
  localStorage.removeItem('fposte_token');
}

async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(API_BASE + endpoint, { ...options, headers });
  
  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      window.location.reload();
    }
    throw new Error('API error');
  }
  
  return response.json();
}

export async function login(username: string, displayName: string) {
  return apiRequest('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, displayName }),
  });
}

export async function getMe() {
  return apiRequest('/api/me');
}

export async function sendMessage(text: string, username: string, channelId?: string) {
  return apiRequest('/api/send', {
    method: 'POST',
    body: JSON.stringify({ text, username, channelId }),
  });
}

export async function loadHistory(channelId?: string) {
  const query = channelId ? `?channel=${channelId}` : '';
  return apiRequest('/api/messages' + query);
}

export async function deleteMessage(id: string, username: string) {
  return apiRequest('/api/delete', {
    method: 'POST',
    body: JSON.stringify({ id, username }),
  });
}

export async function clearChat(username: string) {
  return apiRequest('/api/clear', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}
export async function listChannels() {
  return apiRequest('/api/channels');
}

export async function createChannel(name: string) {
  return apiRequest('/api/channels/create', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}
