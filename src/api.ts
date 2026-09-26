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
    const errText = await response.text();
    throw new Error(`API error: ${response.status} - ${errText}`);
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
  const data = await apiRequest('/api/messages' + query);
  return Array.isArray(data) ? data : []; // ЗАЩИТА
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
  const data = await apiRequest('/api/channels');
  return Array.isArray(data) ? data : []; // ЗАЩИТА: гарантируем массив
}

export async function createChannel(name: string) {
  return apiRequest('/api/channels/create', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function sendPrivateMessage(to: string, text: string) {
  return apiRequest('/api/private/send', {
    method: 'POST',
    body: JSON.stringify({ to, text }),
  });
}

export async function loadPrivateHistory(withUser: string) {
  const data = await apiRequest(`/api/private/history?with=${withUser}`);
  return Array.isArray(data) ? data : []; // ЗАЩИТА
}

export async function listPrivateChats() {
  const data = await apiRequest('/api/private/chats');
  return Array.isArray(data) ? data : []; // ЗАЩИТА: гарантируем массив
}

export async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const token = getToken();
  
  const response = await fetch(API_BASE + '/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  
  if (!response.ok) throw new Error('Upload error');
  return response.json();
}
