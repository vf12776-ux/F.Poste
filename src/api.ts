import { createClient } from '@supabase/supabase-js'

const EDGE_FUNCTION_URL = "https://ibwuozucqkeylykndign.supabase.co/functions/v1";
const SUPABASE_ANON_KEY = "sb_publishable_aizrKrP8OKsX6u4SXEl35A_YHf7ywbg";

export function setToken(token: string) { localStorage.setItem('fposte_token', token); }
export function getToken(): string | null { return localStorage.getItem('fposte_token'); }
export function clearToken() { localStorage.removeItem('fposte_token'); }

export async function login(username: string, displayName: string) {
  const response = await fetch(`${EDGE_FUNCTION_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ username, displayName }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Login failed');
  }
  const data = await response.json();
  if (data.token) setToken(data.token);
  return data;
}

export async function getMe() {
  const token = getToken();
  const response = await fetch(`${EDGE_FUNCTION_URL}/get-me`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
  });
  return response.ok ? response.json() : null;
}

export async function listPrivateChats() {
  const token = getToken();
  const response = await fetch(`${EDGE_FUNCTION_URL}/list-private-chats`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
  });
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function loadPrivateHistory(withUser: string) {
  const token = getToken();
  const response = await fetch(`${EDGE_FUNCTION_URL}/load-private-history?with=${encodeURIComponent(withUser)}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
  });
  const data = await response.json();
  return Array.isArray(data) ? data.map((m: any) => ({
    id: m.id,
    username: m.from_username,
    text: m.text,
    timestamp: m.timestamp,
    fileUrl: m.file_url || '',
    fileName: m.file_name || '',
    to_username: m.to_username,
    from_username: m.from_username,
  })) : [];
}

export async function sendPrivateMessage(to: string, text: string, fileUrl?: string, fileName?: string) {
  const token = getToken();
  const response = await fetch(`${EDGE_FUNCTION_URL}/send-private-message`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'Authorization': `Bearer ${token}`, 
      'apikey': SUPABASE_ANON_KEY 
    },
    body: JSON.stringify({ to, text, fileUrl: fileUrl || "", fileName: fileName || "" }),
  });
  if (!response.ok) throw new Error('Failed to send');
  return response.json();
}

export async function uploadFile(file: File): Promise<{ url: string; name: string }> {
  const token = getToken();
  const uniqueName = `${Date.now()}_${file.name.replace(/\s/g, '_')}`;
  const supabaseUrl = "https://ibwuozucqkeylykndign.supabase.co";
  
  const response = await fetch(`${supabaseUrl}/storage/v1/object/fposte-files/${uniqueName}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': file.type, 'x-upsert': 'true' },
    body: file,
  });
  if (!response.ok) throw new Error('Upload failed');
  return { url: `${supabaseUrl}/storage/v1/object/public/fposte-files/${uniqueName}`, name: file.name };
}

// Supabase клиент для Realtime (подписка на новые сообщения)
const supabase = createClient("https://ibwuozucqkeylykndign.supabase.co", SUPABASE_ANON_KEY)

export function subscribeToPrivateMessages(username: string, callback: (message: any) => void) {
  return supabase.channel(`private-${username}`).on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'private_messages' },
    (payload) => {
      const msg = payload.new;
      if (msg.from_username === username || msg.to_username === username) callback(msg);
    }
  ).subscribe();
}

export function unsubscribeFromChannel(subscription: any) {
  if (subscription) supabase.removeChannel(subscription);
}