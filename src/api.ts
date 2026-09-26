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
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(API_BASE + endpoint, { ...options, headers });
  
  if (!response.ok) {
    const text = await response.text();
    console.error(`API Error ${endpoint}:`, response.status, text);
    if (response.status === 401) {
      clearToken();
      window.location.reload();
    }
    throw new Error(text || `HTTP ${response.status}`);
  }
  
  if (response.status === 200 && response.headers.get("content-length") === "0") {
    return null;
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

// 🔥 ОБНОВЛЕНО: поддержка fileUrl и fileName
export async function sendMessage(text: string, username: string, channelId?: string, fileUrl?: string, fileName?: string) {
  return apiRequest('/api/send', {
    method: 'POST',
    body: JSON.stringify({ 
      text, 
      username, 
      channelId: channelId || "",
      fileUrl: fileUrl || "",
      fileName: fileName || ""
    }),
  });
}

export async function loadHistory(channelId?: string) {
  const query = channelId ? `?channel=${channelId}` : '';
  const data = await apiRequest('/api/messages' + query);
  if (!Array.isArray(data)) return [];
  return data.map((m: any) => ({
    ...m,
    file_url: m.file_url || m.fileUrl || '',
    file_name: m.file_name || m.fileName || '',
  }));
}

export async function deleteMessage(id: string) {
  return apiRequest('/api/delete', {
    method: 'POST',
    body: JSON.stringify({ id }),
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
  return Array.isArray(data) ? data : [];
}

export async function createChannel(name: string) {
  return apiRequest('/api/channels/create', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// 🔥 ОБНОВЛЕНО: поддержка fileUrl и fileName
export async function sendPrivateMessage(to: string, text: string, fileUrl?: string, fileName?: string) {
  return apiRequest('/api/private/send', {
    method: 'POST',
    body: JSON.stringify({ to, text, fileUrl: fileUrl || "", fileName: fileName || "" }),
  });
}

export async function loadPrivateHistory(withUser: string) {
  const data = await apiRequest(`/api/private/history?with=${withUser}`);
  if (!Array.isArray(data)) return [];
  return data.map((m: any) => ({
    ...m,
    file_url: m.file_url || m.fileUrl || '',
    file_name: m.file_name || m.fileName || '',
  }));
}

export async function listPrivateChats() {
  try {
    const data = await apiRequest('/api/private/chats');
    if (Array.isArray(data)) {
      return data.map((item: any) => item.partner || item.username || 'Unknown');
    }
    return [];
  } catch (e) {
    console.error("Error loading private chats", e);
    return [];
  }
}

// 🔥 ОБНОВЛЕНО: возвращает объект { url, name }
export async function uploadFile(file: File): Promise<{ url: string; name: string }> {
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

export async function editMessage(id: string, text: string) {
  return apiRequest('/api/edit', {
    method: 'POST',
    body: JSON.stringify({ id, text }),
  });
}

export async function editPrivateMessage(id: string, text: string) {
  return apiRequest('/api/private/edit', {
    method: 'POST',
    body: JSON.stringify({ id, text }),
  });
}

export async function deletePrivateMessage(id: string) {
  return apiRequest('/api/private/delete', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

export async function clearPrivateChat(withUser: string) {
  return apiRequest('/api/private/clear', {
    method: 'POST',
    body: JSON.stringify({ withUser }),
  });
}

export async function clearChannel(channelId: string) {
  return apiRequest('/api/clear-channel', {
    method: 'POST',
    body: JSON.stringify({ channelId }),
  });
}
