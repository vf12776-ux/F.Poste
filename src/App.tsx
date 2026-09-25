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
  const [showSidebar, setShowSidebar] = useState(true);
  const [newChannelName, setNewChannelName] = useState('');
  const [newPrivateUser, setNewPrivateUser] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = getToken();
    const forceTimeout = setTimeout(() => {
      setLoading(false);
    }, 10000);
    
    if (token) {
      getMe()
        .then((userData) => {
          setUser(userData);
          loadChannels();
          loadPrivateChatsList();
        })
        .catch(() => {
          clearToken();
        })
        .finally(() => {
          clearTimeout(forceTimeout);
          setLoading(false);
        });
    } else {
      clearTimeout(forceTimeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentChannelId && !currentPrivateUser) {
      fetchMessages();
    }
  }, [currentChannelId]);

  useEffect(() => {
    if (currentPrivateUser) {
      fetchPrivateMessages();
    }
  }, [currentPrivateUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadChannels = async () => {
    try {
      const data = await listChannels();
      setChannels(data || []);
      if (data && data.length > 0 && !currentChannelId && !currentPrivateUser) {
        setCurrentChannelId(data[0].id);
      }
    } catch (e) {
      console.error('Failed to load channels', e);
    }
  };

  const loadPrivateChatsList = async () => {
    try {
      const data = await listPrivateChats();
      setPrivateChats(data || []);
    } catch (e) {
      console.error('Failed to load private chats', e);
    }
  };

  const fetchMessages = async () => {
    if (!currentChannelId) return;
    try {
      const data = await loadHistory(currentChannelId);
      setMessages(data || []);
    } catch (e) {
      console.error('Failed to load history', e);
    }
  };

  const fetchPrivateMessages = async () => {
    if (!currentPrivateUser) return;
    try {
      const data = await loadPrivateHistory(currentPrivateUser);
      setMessages(data || []);
    } catch (e) {
      console.error('Failed to load private history', e);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;
    
    const text = newMessage;
    setNewMessage('');

    try {
      if (currentPrivateUser) {
        await sendPrivateMessage(currentPrivateUser, text);
        fetchPrivateMessages();
      } else if (currentChannelId) {
        await sendMessage(text, user.username, currentChannelId);
        fetchMessages();
      }
    } catch (e) {
      console.error('Failed to send', e);
      alert('Ошибка отправки');
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

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    try {
      const channel = await createChannel(newChannelName.trim());
      setChannels(prev => [...prev, channel]);
      setCurrentChannelId(channel.id);
      setCurrentPrivateUser(null);
      setNewChannelName('');
    } catch (e) {
      alert('Канал уже существует или ошибка создания');
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
    setCurrentPrivateUser(username);
    setCurrentChannelId(null);
    setNewPrivateUser('');
  };

  const handleBackToChannels = () => {
    setCurrentPrivateUser(null);
    if (channels.length > 0) {
      setCurrentChannelId(channels[0].id);
    }
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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f5f5f5' }}>
        <h2>Загрузка...</h2>
      </div>
    );
  }

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

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f5f5f5' }}>
      {showSidebar && (
        <div style={{ width: '250px', background: '#2c3e50', color: 'white', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '15px', borderBottom: '1px solid #34495e' }}>
            <h3 style={{ margin: 0 }}>Каналы</h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {channels.map((ch) => (
              <div
                key={ch.id}
                onClick={() => {
                  setCurrentChannelId(ch.id);
                  setCurrentPrivateUser(null);
                }}
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
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: 'none', marginBottom: '5px' }}
            />
            <button type="submit" style={{ width: '100%', padding: '8px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Создать</button>
          </form>

          <div style={{ padding: '15px', borderTop: '1px solid #34495e' }}>
            <h3 style={{ margin: 0, marginBottom: '10px' }}>Личные</h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {privateChats.map((chat) => (
              <div
                key={chat.partner}
                onClick={() => {
                  setCurrentPrivateUser(chat.partner);
                  setCurrentChannelId(null);
                }}
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
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: 'none', marginBottom: '5px' }}
            />
            <button type="submit" style={{ width: '100%', padding: '8px', background: '#9b59b6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Написать</button>
          </form>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{ padding: '15px', background: '#007bff', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={() => setShowSidebar(!showSidebar)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>☰</button>
            <h2 style={{ margin: 0 }}>
              {currentPrivateUser 
                ? `@${currentPrivateUser}` 
                : channels.find(c => c.id === currentChannelId)?.name 
                  ? `#${channels.find(c => c.id === currentChannelId)?.name}` 
                  : 'Выбери канал'}
            </h2>
            {currentPrivateUser && (
              <button onClick={handleBackToChannels} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>← Назад</button>
            )}
          </div>
          <div>
            {!currentPrivateUser && (
              <button onClick={handleClear} style={{ marginRight: '10px', background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Очистить</button>
            )}
            <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Выйти</button>
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
              alignSelf: (currentPrivateUser ? msg.from === user.username : msg.username === user.username) ? 'flex-end' : 'flex-start',
              background: (currentPrivateUser ? msg.from === user.username : msg.username === user.username) ? '#007bff' : '#e9ecef',
              color: (currentPrivateUser ? msg.from === user.username : msg.username === user.username) ? 'white' : 'black',
              padding: '10px 15px',
              borderRadius: '15px',
              maxWidth: '70%',
              position: 'relative'
            }}>
              <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>
                {currentPrivateUser ? msg.from : msg.username}
              </div>
              {renderMessageContent(msg)}
              {(currentPrivateUser ? msg.from === user.username : msg.username === user.username) && (
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
            onChange={async (e) => {
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
                  fetchPrivateMessages();
                } else if (currentChannelId) {
                  await sendMessage(file.name, user.username, currentChannelId);
                  fetchMessages();
                }
              } catch (e) {
                console.error('Upload failed', e);
              } finally {
                setUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }
            }}
            style={{ display: 'none' }}
          />
                    <button 
            type="button" 
            onClick={async () => {
              if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert('Запись голоса не поддерживается в этом браузере');
                return;
              }
              try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const mediaRecorder = new MediaRecorder(stream);
                const chunks: Blob[] = [];
                
                mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
                mediaRecorder.onstop = async () => {
                  const blob = new Blob(chunks, { type: 'audio/webm' });
                  const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
                  
                  const formData = new FormData();
                  formData.append('file', file);
                  formData.append('username', user.username);
                  if (currentChannelId) formData.append('channelId', currentChannelId);
                  
                  await fetch('/upload', { method: 'POST', body: formData });
                  
                  if (currentPrivateUser) {
                    await sendPrivateMessage(currentPrivateUser, file.name);
                    fetchPrivateMessages();
                  } else if (currentChannelId) {
                    await sendMessage(file.name, user.username, currentChannelId);
                    fetchMessages();
                  }
                  
                  stream.getTracks().forEach(track => track.stop());
                };
                
                mediaRecorder.start();
                alert('Запись началась. Нажмите OK, чтобы остановить.');
                setTimeout(() => mediaRecorder.stop(), 10000); // Максимум 10 секунд
              } catch (err) {
                alert('Ошибка записи: ' + err);
              }
            }}
            style={{ background: '#e74c3c', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontSize: '18px' }} 
            title="Записать голос"
          >🎤</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ background: '#6c757d', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontSize: '18px' }} title="Прикрепить файл">📎</button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={currentPrivateUser ? `Написать @${currentPrivateUser}...` : "Введите сообщение..."}
            style={{ flex: 1, padding: '10px', borderRadius: '20px', border: '1px solid #ddd', outline: 'none' }}
          />
          <button type="submit" style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer' }}>Отправить</button>
        </form>
      </div>
    </div>
  );
}
