const API_BASE = '';
const EDGE_FUNCTION_URL = "https://ibwuozucqkeylykndign.supabase.co/functions/v1";

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
  const response = await fetch(`${EDGE_FUNCTION_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, displayName }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Login failed');
  }

  const data = await response.json();
  
  // Сохраняем токен, если он пришел
  if (data.token) {
    setToken(data.token);
  }
  
  return data;
}

export async function getMe() {
  return apiRequest('/api/me');
}

export async function sendMessage(text: string, username: string, channelId?: string, fileUrl?: string, fileName?: string) {
  const response = await fetch(`${EDGE_FUNCTION_URL}/send-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      text, 
      username, 
      channel_id: channelId || "",
      file_url: fileUrl || "",
      file_name: fileName || ""
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to send message');
  }

  return await response.json();
}

export async function loadHistory(channelId?: string) {
  const query = channelId ? `?channel=${channelId}` : '';
  
  const response = await fetch(`${EDGE_FUNCTION_URL}/load-history${query}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to load history');
  }

  const data = await response.json();
  if (!Array.isArray(data)) return [];
  
  // Оставляем ту же нормализацию данных, чтобы фронтенд не сломался
  return data.map((m: any) => ({
    id: m.id,
    username: m.username,
    text: m.text,
    timestamp: m.timestamp,
    channelId: m.channelId || m.channel_id,
    edited: m.edited,
    fileUrl: m.fileUrl || m.file_url || '',
    fileName: m.fileName || m.file_name || '',
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
  const response = await fetch(`${EDGE_FUNCTION_URL}/list-channels`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to load channels');
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function createChannel(name: string) {
  return apiRequest('/api/channels/create', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function sendPrivateMessage(to: string, text: string, fileUrl?: string, fileName?: string) {
  const token = getToken();
  
  const response = await fetch(`${EDGE_FUNCTION_URL}/send-private-message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ 
      to, 
      text, 
      fileUrl: fileUrl || "", 
      fileName: fileName || "" 
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to send private message');
  }

  return await response.json();
}

export async function listPrivateChats() {
  const token = getToken();
  const response = await fetch(`${EDGE_FUNCTION_URL}/list-private-chats`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (!response.ok) {
    console.error("Error loading private chats", response.status);
    return [];
  }

  const data = await response.json();
  if (Array.isArray(data)) {
    return data.map((item: any) => item.partner || 'Unknown');
  }
  return [];
}

export async function loadPrivateHistory(withUser: string) {
  const token = getToken();
  const response = await fetch(`${EDGE_FUNCTION_URL}/load-private-history?with=${encodeURIComponent(withUser)}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (!response.ok) {
    throw new Error('Failed to load private history');
  }

  const data = await response.json();
  if (!Array.isArray(data)) return [];

  return data.map((m: any) => ({
    id: m.id,
    username: m.from_username || m.from || m.username,
    text: m.text,
    timestamp: m.timestamp,
    edited: m.edited,
    fileUrl: m.fileUrl || m.file_url || '',
    fileName: m.fileName || m.file_name || '',
    to_username: m.to_username,
    from_username: m.from_username,
  }));
}

export async function uploadFile(file: File): Promise<{ url: string; name: string }> {
  const token = getToken();
  const supabaseUrl = "https://ibwuozucqkeylykndign.supabase.co";
  
  // Генерируем уникальное имя, чтобы файлы не перезаписывались
  const uniqueName = `${Date.now()}_${file.name.replace(/\s/g, '_')}`;
  const storageUrl = `${supabaseUrl}/storage/v1/object/fposte-files/${uniqueName}`;
  
  const response = await fetch(storageUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': file.type,
      'x-upsert': 'true', // Разрешаем перезапись если имя совпало (на всякий случай)
    },
    body: file,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Supabase Upload Error:", errorText);
    throw new Error(`Upload failed: ${response.status}`);
  }

  // Возвращаем публичную ссылку вручную, так как Supabase PUT не всегда возвращает JSON
  return { 
    url: `${supabaseUrl}/storage/v1/object/public/fposte-files/${uniqueName}`, 
    name: file.name 
  };
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
// Realtime через нативный WebSocket (без установки библиотек)
const supabaseUrl = "https://ibwuozucqkeylykndign.supabase.co"
const supabasePublishableKey = "sb_publishable_aizrKrP8OKsX6u4SXEl35A_YHf7ywbg"

export function subscribeToMessages(channelId: string, callback: (message: any) => void) {
  const wsUrl = `wss://${supabaseUrl.replace('https://', '')}/realtime/v1/websocket?apikey=${supabasePublishableKey}&vsn=1.0.0`
  const ws = new WebSocket(wsUrl)
  
  ws.onopen = () => {
    // Подписываемся на изменения в таблице messages
    ws.send(JSON.stringify({
      topic: `realtime:public:messages`,
      event: 'phx_join',
      payload: { config: { broadcast: { self: true } } },
      ref: '1'
    }))
  }
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.event === 'INSERT' && data.payload?.new) {
        const msg = data.payload.new
        if (!channelId || msg.channel_id === channelId) {
          callback(msg)
        }
      }
    } catch (e) {
      console.error('WebSocket parse error:', e)
    }
  }
  
  return ws
}

export function subscribeToPrivateMessages(username: string, callback: (message: any) => void) {
  const wsUrl = `wss://${supabaseUrl.replace('https://', '')}/realtime/v1/websocket?apikey=${supabasePublishableKey}&vsn=1.0.0`
  const ws = new WebSocket(wsUrl)
  
  ws.onopen = () => {
    ws.send(JSON.stringify({
      topic: `realtime:public:private_messages`,
      event: 'phx_join',
      payload: { config: { broadcast: { self: true } } },
      ref: '1'
    }))
  }
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.event === 'INSERT' && data.payload?.new) {
        const msg = data.payload.new
        if (msg.from_username === username || msg.to_username === username) {
          callback(msg)
        }
      }
    } catch (e) {
      console.error('WebSocket parse error:', e)
    }
  }
  
  return ws
}

export function unsubscribeFromChannel(ws: WebSocket | null) {
  if (ws) {
    ws.close()
  }
}

