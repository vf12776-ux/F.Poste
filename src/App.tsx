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
      await fetch('/upload', { method: 'POST', body: formData });
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
  if (username.length < 5) {
    alert('Минимум 5 символов');
    return;
  }
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, displayName: username })
    });
    if (!res.ok) {
      const errorText = await res.text();
      alert('Ошибка входа: ' + errorText);
      return;
    }
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('fposte_token', data.token);
      setTimeout(() => window.location.reload(), 100);
    } else {
      alert('Сервер не вернул токен');
    }
  } catch (err) {
    alert('Ошибка соединения: ' + err);
  }
}} style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '300px' }}>
  <input name="username" placeholder="Ник (мин. 5 символов)" required style={{ padding: '10px' }} />
  <button type="submit" style={{ padding: '10px', background: '#007bff', color: 'white', border: 'none', cursor: 'pointer' }}>Войти</button>
</form>
      </div>
    );
  }

  // Основной интерфейс чата
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: '800px', margin: '0 auto', background: '#f5f5f5' }}>
      <header style={{ padding: '15px', background: '#007bff', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>F.Poste ({user.username})</h2>
        <div>
          <button onClick={handleClear} style={{ marginRight: '10px', background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Очистить</button>
          <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Выйти</button>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ 
            alignSelf: msg.username === user.username ? 'flex-end' : 'flex-start',
            background: msg.username === user.username ? '#007bff' : '#e9ecef',
            color: msg.username === user.username ? 'white' : 'black',
            padding: '10px 15px',
            borderRadius: '15px',
            maxWidth: '70%',
            position: 'relative'
          }}>
            <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>{msg.username}</div>
            {renderMessageContent(msg)}
            {msg.username === user.username && (
              <button 
                onClick={() => handleDelete(msg.id)}
                style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ff4444', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '14px', lineHeight: '18px' }}
              >×</button>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} style={{ padding: '15px', background: 'white', borderTop: '1px solid #ddd', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ background: '#6c757d', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontSize: '18px' }} title="Прикрепить файл">📎</button>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Введите сообщение..."
          style={{ flex: 1, padding: '10px', borderRadius: '20px', border: '1px solid #ddd', outline: 'none' }}
        />
        <button type="submit" style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer' }}>Отправить</button>
      </form>
    </div>
  );
}
