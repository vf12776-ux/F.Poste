import { useState, useEffect, useRef } from 'react';
import { getMe, getToken, clearToken, loadHistory, sendMessage, deleteMessage, clearChat, listChannels, createChannel, sendPrivateMessage, loadPrivateHistory, listPrivateChats } from './api';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [privateChats, setPrivateChats] = useState<any[]>([]);
  const [currentPrivateUser, setCurrentPrivateUser] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(window.innerWidth > 768);
  const [newChannelName, setNewChannelName] = useState('');
  const [newPrivateUser, setNewPrivateUser] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Загрузка пользователя при старте
  useEffect(() => {
    const token = getToken();
    const forceTimeout = setTimeout(() => setLoading(false), 10000);
    
    if (token) {
      getMe()
        .then((userData) => {
          setUser(userData);
          initApp();
        })
        .catch(() => clearToken())
        .finally(() => {
          clearTimeout(forceTimeout);
          setLoading(false);
        });
    } else {
      clearTimeout(forceTimeout);
      setLoading(false);
    }
  }, []);

  // Авто-скрытие sidebar на мобильных
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) setShowSidebar(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Авто-скролл вниз при новых сообщениях
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const initApp = async () => {
    try {
      const [chData, chatsData] = await Promise.all([listChannels(), listPrivateChats()]);
      setChannels(chData || []);
      setPrivateChats(chatsData || []);
      if (chData && chData.length > 0) {
        setCurrentChannelId(chData[0].id);
        const msgs = await loadHistory(chData[0].id);
        setMessages(msgs || []);
      }
    } catch (e) {
      console.error('Init failed:', e);
    }
  };

  const switchToChannel = async (channelId: string) => {
    setCurrentChannelId(channelId);
    setCurrentPrivateUser(null);
    try {
      const msgs = await loadHistory(channelId);
      setMessages(msgs || []);
    } catch (e) {
      console.error('Load channel failed:', e);
      setMessages([]);
    }
    if (window.innerWidth <= 768) setShowSidebar(false);
  };

  const switchToPrivate = async (username: string) => {
    setCurrentPrivateUser(username);
    setCurrentChannelId(null);
    try {
      const msgs = await loadPrivateHistory(username);
      setMessages(msgs || []);
    } catch (e) {
      console.error('Load private failed:', e);
      setMessages([]);
    }
    if (window.innerWidth <= 768) setShowSidebar(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;
    
    const text = newMessage;
    setNewMessage('');
    
    // Сразу добавляем сообщение в UI (оптимистично)
    const tempMsg = {
      id: 'temp-' + Date.now(),
      username: user.username,
      from: user.username,
      text: text,
      timestamp: Math.floor(Date.now() / 1000)
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      if (currentPrivateUser) {
        await sendPrivateMessage(currentPrivateUser, text);
        // Перезагружаем историю, чтобы получить реальные ID
        const msgs = await loadPrivateHistory(currentPrivateUser);
        setMessages(msgs || []);
      } else if (currentChannelId) {
        await sendMessage(text, user.username, currentChannelId);
        const msgs = await loadHistory(currentChannelId);
        setMessages(msgs || []);
      }
    } catch (e) {
      console.error('Send failed:', e);
      alert('Ошибка отправки: ' + e);
      // Убираем временное сообщение при ошибке
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      await deleteMessage(id, user.username);
      setMessages(prev => prev.filter(m => m.id !== id));
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  const handleClear = async () => {
    if (!user || !window.confirm('Очистить весь чат?')) return;
    try {
      await clearChat(user.username);
      setMessages([]);
    } catch (e) {
      console.error('Clear failed:', e);
    }
  };

  const handleLogout = () => {
    clearToken();
    setUser(null);
    setMessages([]);
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    try {
      const channel = await createChannel(newChannelName.trim());
      setChannels(prev => [...prev, channel]);
      await switchToChannel(channel.id);
      setNewChannelName('');
    } catch (e) {
      alert('Канал уже существует');
    }
  };

  const handleStartPrivateChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrivateUser.trim()) return;
    const username = newPrivateUser.trim().toLowerCase();
    if (username === user.username) {
      alert('Нельзя написать себе');
      return;
    }
    switchToPrivate(username);
    setNewPrivateUser('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('username', user.username);
      if (currentChannelId) formData.append('channelId', currentChannelId);
      await fetch('/upload', { method: 'POST', body: formData });
      
      if (currentPrivateUser) {
        await sendPrivateMessage(currentPrivateUser, file.name);
        const msgs = await loadPrivateHistory(currentPrivateUser);
        setMessages(msgs || []);
      } else if (currentChannelId) {
        await sendMessage(file.name, user.username, currentChannelId);
        const msgs = await loadHistory(currentChannelId);
        setMessages(msgs || []);
      }
    } catch (e) {
      console.error('Upload failed', e);
      alert('Ошибка загрузки файла');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const renderMessageContent = (msg: any) => {
    if (msg.isFile) {
      const ext = msg.fileName?.split('.').pop()?.toLowerCase() || '';
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
      const isAudio = ['webm', 'ogg', 'mp3', 'm4a', 'wav'].includes(ext);
      const isVideo = ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);
      const url = `/api/file/${msg.id}`;

      if (isImage) return <img src={url} alt={msg.fileName} style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px' }} />;
      if (isVideo) return <video controls src={url} style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px' }} />;
      if (isAudio) return <audio controls src={url} style={{ maxWidth: '100%' }} />;
      return <a href={url} download={msg.fileName} style={{ color: 'inherit', textDecoration: 'underline' }}>📎 {msg.fileName}</a>;
    }
    return <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{msg.text}</div>;
  };

  const isMyMessage = (msg: any) => {
    if (currentPrivateUser) return msg.from === user.username;
    return msg.username === user.username;
  };

  // ЭКРАН ЗАГРУЗКИ
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f5f5f5' }}>
        <h2>Загрузка...</h2>
      </div>
    );
  }

  // ЭКРАН ВХОДА
  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f5f5f5', padding: '20px' }}>
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
              alert('Ошибка входа: ' + await res.text());
              return;
            }
            const data = await res.json();
            if (data.token) {
              localStorage.setItem('fposte_token', data.token);
              setTimeout(() => window.location.reload(), 100);
            }
          } catch (err) {
            alert('Ошибка соединения: ' + err);
          }
        }} style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '300px' }}>
          <input name="username" placeholder="Ник (мин. 5 символов)" required style={{ padding: '10px', fontSize: '16px' }} />
          <button type="submit" style={{ padding: '10px', background: '#007bff', color: 'white', border: 'none', cursor: 'pointer', fontSize: '16px' }}>Войти</button>
        </form>
      </div>
    );
  }

  // ОСНОВНОЙ ИНТЕРФЕЙС
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f5f5f5', overflow: 'hidden' }}>
      {/* SIDEBAR */}
      {showSidebar && (
        <div style={{ 
          width: window.innerWidth <= 768 ? '100%' : '250px', 
          position: window.innerWidth <= 768 ? 'absolute' : 'relative',
          zIndex: 10,
          background: '#2c3e50', 
          color: 'white', 
          display: 'flex', 
          flexDirection: 'column',
          height: '100%'
        }}>
          <div style={{ padding: '15px', borderBottom: '1px solid #34495e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Каналы</h3>
            {window.innerWidth <= 768 && (
              <button onClick={() => setShowSidebar(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {channels.map((ch) => (
              <div
                key={ch.id}
                onClick={() => switchToChannel(ch.id)}
                style={{
                  padding: '10px',
                  cursor: 'pointer',
                  background: currentChannelId === ch.id && !currentPrivateUser ? '#34495e' : 'transparent',
                  borderRadius: '4px',
                  marginBottom: '5px'
                }}
              >
                #{ch.name}
              </div>
            ))}
          </div>
          <form onSubmit={handleCreateChannel} style={{ padding: '10px', borderTop: '1px solid #34495e' }}>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="Новый канал"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: 'none', marginBottom: '5px', boxSizing: 'border-box' }}
            />
            <button type="submit" style={{ width: '100%', padding: '8px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Создать</button>
          </form>

          <div style={{ padding: '15px', borderTop: '1px solid #34495e' }}>
            <h3 style={{ margin: 0, marginBottom: '10px' }}>Личные</h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {privateChats.length === 0 && <div style={{ padding: '10px', opacity: 0.6, fontSize: '14px' }}>Нет диалогов</div>}
            {privateChats.map((chat) => (
              <div
                key={chat.partner}
                onClick={() => switchToPrivate(chat.partner)}
                style={{
                  padding: '10px',
                  cursor: 'pointer',
                  background: currentPrivateUser === chat.partner ? '#34495e' : 'transparent',
                  borderRadius: '4px',
                  marginBottom: '5px'
                }}
              >
                @{chat.partner}
              </div>
            ))}
          </div>
          <form onSubmit={handleStartPrivateChat} style={{ padding: '10px', borderTop: '1px solid #34495e' }}>
            <input
              type="text"
              value={newPrivateUser}
              onChange={(e) => setNewPrivateUser(e.target.value)}
              placeholder="Ник пользователя"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: 'none', marginBottom: '5px', boxSizing: 'border-box' }}
            />
            <button type="submit" style={{ width: '100%', padding: '8px', background: '#9b59b6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Написать</button>
          </form>
        </div>
      )}

      {/* MAIN AREA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', minWidth: 0 }}>
        <header style={{ padding: '15px', background: '#007bff', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
            <button onClick={() => setShowSidebar(!showSidebar)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }}>☰</button>
            <h2 style={{ margin: 0, fontSize: window.innerWidth <= 768 ? '16px' : '20px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentPrivateUser 
                ? `@${currentPrivateUser}` 
                : channels.find(c => c.id === currentChannelId)?.name 
                  ? `#${channels.find(c => c.id === currentChannelId)?.name}` 
                  : 'Выбери канал'}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
            {!currentPrivateUser && (
              <button onClick={handleClear} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: window.innerWidth <= 768 ? '12px' : '14px' }}>Очистить</button>
            )}
            <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: window.innerWidth <= 768 ? '12px' : '14px' }}>Выйти</button>
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#999', marginTop: '50px' }}>
              Нет сообщений. Напиши первое!
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} style={{ 
              alignSelf: isMyMessage(msg) ? 'flex-end' : 'flex-start',
              background: isMyMessage(msg) ? '#007bff' : '#e9ecef',
              color: isMyMessage(msg) ? 'white' : 'black',
              padding: '10px 15px',
              borderRadius: '15px',
              maxWidth: '80%',
              position: 'relative',
              wordBreak: 'break-word'
            }}>
              <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>
                {currentPrivateUser ? msg.from : msg.username}
              </div>
              {renderMessageContent(msg)}
              {isMyMessage(msg) && !msg.id.startsWith('temp-') && (
                <button 
                  onClick={() => handleDelete(msg.id)}
                  style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ff4444', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '14px', lineHeight: '18px' }}
                >×</button>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} style={{ padding: '15px', background: 'white', borderTop: '1px solid #ddd', display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ background: '#6c757d', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontSize: '18px', flexShrink: 0 }} title="Файл">📎</button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={currentPrivateUser ? `@${currentPrivateUser}...` : "Сообщение..."}
            style={{ flex: 1, padding: '10px', borderRadius: '20px', border: '1px solid #ddd', outline: 'none', minWidth: 0, fontSize: '16px' }}
          />
          <button type="submit" disabled={uploading} style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer', flexShrink: 0 }}>➤</button>
        </form>
      </div>
    </div>
  );
}
