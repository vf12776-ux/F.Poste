import { useState, useEffect, useRef } from 'react';
import { getMe, getToken, clearToken, loadHistory, sendMessage, deleteMessage, clearChat } from './api';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = getToken();
    if (token) {
      getMe()
        .then((userData) => {
          setUser(userData);
          fetchMessages();
        })
        .catch(() => {
          clearToken();
        });
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const data = await loadHistory();
      setMessages(data || []);
    } catch (e) {
      console.error('Failed to load history', e);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;
    
    setMessages(prev => [...prev, { id: 'temp-' + Date.now(), username: user.username, text: newMessage, timestamp: Date.now() }]);
    const text = newMessage;
    setNewMessage('');

    try {
      await sendMessage(text, user.username);
      fetchMessages();
    } catch (e) {
      console.error('Failed to send', e);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('username', user.username);
      const res = await fetch('/upload', { method: 'POST', body: formData });
      await sendMessage(file.name, user.username);
      fetchMessages();
    } catch (e) {
      console.error('Upload failed', e);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      await deleteMessage(id, user.username);
      setMessages(prev => prev.filter(m => m.id !== id));
    } catch (e) {
      console.error('Failed to delete', e);
    }
  };

  const handleClear = async () => {
    if (!user || !window.confirm('Очистить весь чат?')) return;
    try {
      await clearChat(user.username);
      setMessages([]);
    } catch (e) {
      console.error('Failed to clear', e);
    }
  };

  const handleLogout = () => {
    clearToken();
    setUser(null);
    setMessages([]);
  };

  const renderMessageContent = (msg: any) => {
    if (msg.isFile) {
      const ext = msg.fileName?.split('.').pop()?.toLowerCase() || '';
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
      const isAudio = ['webm', 'ogg', 'mp3', 'm4a', 'wav'].includes(ext);
      const url = `/api/file/${msg.id}`;

      if (isImage) {
        return <img src={url} alt={msg.fileName} style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', display: 'block' }} />;
      }
      if (isAudio) {
        return <audio controls src={url} style={{ maxWidth: '100%' }} />;
      }
      return <a href={url} download={msg.fileName} style={{ color: 'inherit', textDecoration: 'underline' }}>📎 {msg.fileName}</a>;
    }
    return <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{msg.text}</div>;
  };

  // Экран входа
  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f5f5f5' }}>
        <h1>F.Poste</h1>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const input = (e.target as any).elements.username;
          const username = input.value.trim().toLowerCase();
          if (username.length < 5) return alert('Минимум 5 символов');
          try {
            const data = await fetch('/api/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, displayName: username })
            }).then(r => r.json());
            localStorage.setItem('fposte_token', data.token);
            window.location.reload();
          } catch (err) {
            alert('Ошибка входа');
          }
        }} style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '300px' }}>
          <input name="username" placeholder="Ник (мин. 5 символов)" required style={{ padding: '10px' }} />
          <button type="submit" style={{ padding: '10px', background: '#007bff', color: 'white', border: 'none' }}>Войти</button>
        </form>
      </div>
    );
  }

  // Основной интерфейс чата
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: '800px', margin: '0 auto', background: '#f5f5f5' }}>
      <header style={{ padding: '15px',
