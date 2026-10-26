import { createClient } from '@supabase/supabase-js'

const EDGE_FUNCTION_URL = "https://ibwuozucqkeylykndign.supabase.co/functions/v1"
const SUPABASE_ANON_KEY = "sb_publishable_aizrKrP8OKsX6u4SXEl35A_YHf7ywbg"
const SUPABASE_URL = "https://ibwuozucqkeylykndign.supabase.co"

export function setToken(token: string) { localStorage.setItem('fposte_token', token) }
export function getToken(): string | null { return localStorage.getItem('fposte_token') }
export function clearToken() { localStorage.removeItem('fposte_token') }

export async function login(username: string, displayName: string) {
  const res = await fetch(`${EDGE_FUNCTION_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ username, displayName }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Login failed')
  }
  const data = await res.json()
  if (data.token) setToken(data.token)
  return data
}

export async function getMe() {
  const token = getToken()
  const res = await fetch(`${EDGE_FUNCTION_URL}/get-me`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
  })
  return res.ok ? res.json() : null
}

// --- ПРИВАТНЫЕ ЧАТЫ ---
export async function listPrivateChats() {
  const token = getToken()
  const res = await fetch(`${EDGE_FUNCTION_URL}/list-private-chats`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
  })
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function loadPrivateHistory(withUser: string) {
  const token = getToken()
  const res = await fetch(`${EDGE_FUNCTION_URL}/load-private-history?with=${encodeURIComponent(withUser)}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
  })
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function sendPrivateMessage(to: string, text: string, fileUrl?: string, fileName?: string) {
  const token = getToken()
  const res = await fetch(`${EDGE_FUNCTION_URL}/send-private-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ to, text, fileUrl: fileUrl || "", fileName: fileName || "" }),
  })
  if (!res.ok) throw new Error('Failed to send private message')
  return res.json()
}

export async function editPrivateMessage(messageId: string, text: string) {
  const token = getToken()
  const res = await fetch(`${EDGE_FUNCTION_URL}/edit-private-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ messageId, text }),
  })
  if (!res.ok) throw new Error('Failed to edit private message')
  return res.json()
}

export async function deletePrivateMessage(messageId: string) {
  const token = getToken()
  const res = await fetch(`${EDGE_FUNCTION_URL}/delete-private-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ messageId }),
  })
  if (!res.ok) throw new Error('Failed to delete private message')
  return res.json()
}

export async function clearPrivateChat(username: string) {
  const token = getToken()
  const res = await fetch(`${EDGE_FUNCTION_URL}/clear-private-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ username }),
  })
  if (!res.ok) throw new Error('Failed to clear private chat')
  return res.json()
}

// --- ФАЙЛЫ ---
export async function uploadFile(file: File): Promise<{ url: string; name: string }> {
  const token = getToken()
  const uniqueName = `${Date.now()}_${file.name.replace(/\s/g, '_')}`
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/fposte-files/${uniqueName}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': file.type, 'x-upsert': 'true' },
    body: file,
  })
  if (!res.ok) throw new Error('Upload failed')
  return { url: `${SUPABASE_URL}/storage/v1/object/public/fposte-files/${uniqueName}`, name: file.name }
}

// --- REALTIME ---
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export function subscribeToPrivateMessages(username: string, callback: (message: any) => void) {
  return supabase.channel(`private-${username}`).on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'private_messages' },
    (payload) => {
      const msg = payload.new
      if (msg.from_username === username || msg.to_username === username) callback(msg)
    }
  ).subscribe()
}

export function unsubscribeFromChannel(subscription: any) {
  if (subscription) supabase.removeChannel(subscription)
}