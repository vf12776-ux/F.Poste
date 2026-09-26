import React, { useState, useEffect, useRef } from 'react';
import { 
  login, getMe, getToken, setToken, clearToken, 
  listChannels, loadHistory, sendMessage, editMessage, deleteMessage, clearChannel,
  listPrivateChats, loadPrivateHistory, sendPrivateMessage, editPrivateMessage, 
  deletePrivateMessage, clearPrivateChat
} from './api';

interface User { username: string; display_name?: string }
interface Channel { id: string; name: string }
interface Message { 
  id: string; 
  username: string; 
  text: string; 
  file_url?: string; 
  file_name?: string; 
  timestamp: number; 
  channel_id?: string;
  edited?: boolean;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [channelMessages, setChannelMessages] = useState<Message[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const [privateChats, setPrivateChats] = useState<string[]>([]);
  const [activePrivateChat, setActivePrivateChat] = useState<string | null>(null);
  const [privateMessages, setPrivateMessages] = useState<Record<string, Message[]>>({});

  const [inputText, setInputText] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // 🔥 Состояния для редактирования
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { checkAuth(); }, []);
  
  useEffect(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [channelMessages, privateMessages, activeChannelId, activePrivateChat]);

  const checkAuth = async () => {
    const token = getToken();
    if (token) {
      try {
        const userData = await getMe();
        setUser(userData);
        await loadInitialData();
      } catch (e) {
        console.error("Auth check failed", e);
        clearToken();
      }
    }
    setIsLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameInput.trim().length < 5) return alert('Минимум 5 символов');
    setIsLoading(true);
    setInitError(null);
    setSendError(null);
    try {
      const data = await login(usernameInput.trim(), usernameInput.trim());
      if (data.token) {
        setToken(data.token);
        setUser({ username: data.username || usernameInput.trim(), display_name: data.displayName });
        await loadInitialData();
      }
    } catch (err: any) {
      alert('Ошибка входа: ' + err.message);
    }
    setIsLoading(false);
  };

  const handleLogout = () => {
    clearToken();
    setUser(null);
    setChannelMessages([]);
    setPrivateMessages({});
    setPrivateChats([]);
  };

  const loadInitialData = async () => {
    setIsHistoryLoading(true);
    setInitError(null);
    try {
      const chs = await listChannels();
      setChannels(chs);
      
      if (chs.length > 0 && !activeChannelId && !activePrivateChat) {
        const general = chs.find((c: Channel) => c.name === 'general') || chs[0];
        setActiveChannelId(general.id);
        await loadChannelMessages(general.id);
      }
    } catch (e) { 
      console.error("Failed to load channels", e); 
      setInitError("Не удалось загрузить каналы.");
    }

    try {
      const pChats = await listPrivateChats();
      setPrivateChats(pChats);
    } catch (e) { 
      console.error("Failed to load private chats", e); 
    }
    setIsHistoryLoading(false);
  };

  const loadChannelMessages = async (channelId: string) => {
    setIsHistoryLoading(true);
    try {
      const msgs = await loadHistory(channelId);
      setChannelMessages(msgs);
    } catch (err) { 
      console.error(err); 
      setSendError("Не удалось загрузить историю");
    }
    setIsHistoryLoading(false);
  };

  const loadPrivateMessages = async (targetUsername: string) => {
    setIsHistoryLoading(true);
    try {
      const msgs = await loadPrivateHistory(targetUsername);
      setPrivateMessages(prev => ({ ...prev, [targetUsername]: msgs }));
    } catch (err) { 
      console.error(err); 
      setSendError("Не удалось загрузить историю ЛС");
    }
    setIsHistoryLoading(false);
  };

  const selectChannel = async (channelId: string) => {
    setActiveChannelId(channelId);
    setActivePrivateChat(null);
    setIsSidebarOpen(false);
    setInputText('');
    setSendError(null);
    setEditingMessageId(null);
    await loadChannelMessages(channelId);
  };

  const selectPrivateChat = async (username: string) => {
    setActivePrivateChat(username);
    setActiveChannelId(null);
    setIsSidebarOpen(false);
    setInputText('');
    setSendError(null);
    setEditingMessageId(null);
    if (!privateMessages[username]) {
      await loadPrivateMessages(username);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user) return;

    const tempId = `temp-${Date.now()}`;
    const newMessage: Message = {
      id: tempId,
      username: user.username,
      text: inputText.trim(),
      timestamp: Math.floor(Date.now() / 1000),
    };

    const textToSend = inputText.trim();
    setInputText('');
    setSendError(null);

    if (activeChannelId) {
      setChannelMessages(prev => [...prev, newMessage]);
      try {
        await sendMessage(textToSend, user.username, activeChannelId);
      } catch (err: any) {
        setSendError("Ошибка: " + err.message);
        setChannelMessages(prev => prev.filter(m => m.id !== tempId));
        setInputText(textToSend);
      }
    } else if (activePrivateChat) {
      setPrivateMessages(prev => ({
        ...prev,
        [activePrivateChat]: [...(prev[activePrivateChat] || []), newMessage]
      }));
      try {
        await sendPrivateMessage(activePrivateChat, textToSend);
        if (!privateChats.includes(activePrivateChat)) {
          setPrivateChats(prev => [...prev, activePrivateChat]);
        }
      } catch (err: any) {
        setSendError("Ошибка ЛС: " + err.message);
        setPrivateMessages(prev => ({
          ...prev,
          [activePrivateChat]: (prev[activePrivateChat] || []).filter(m => m.id !== tempId)
        }));
        setInputText(textToSend);
      }
    }
  };

  // 🔥 Редактирование сообщения
  const startEditing = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditingText(msg.text);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const saveEdit = async () => {
    if (!editingMessageId || !editingText.trim()) return;

    try {
      if (activeChannelId) {
        await editMessage(editingMessageId, editingText.trim());
        setChannelMessages(prev => prev.map(m => 
          m.id === editingMessageId ? { ...m, text: editingText.trim(), edited: true } : m
        ));
      } else if (activePrivateChat) {
        await editPrivateMessage(editingMessageId, editingText.trim());
        setPrivateMessages(prev => ({
          ...prev,
          [activePrivateChat]: (prev[activePrivateChat] || []).map(m => 
            m.id === editingMessageId ? { ...m, text: editingText.trim(), edited: true } : m
          )
        }));
      }
      cancelEditing();
    } catch (err: any) {
      alert("Ошибка редактирования: " + err.message);
    }
  };

  // 🔥 Удаление сообщения
  const handleDeleteMessage = async (msgId: string) => {
    if (!confirm("Удалить это сообщение?")) return;

    try {
      if (activeChannelId) {
        await deleteMessage(msgId);
        setChannelMessages(prev => prev.filter(m => m.id !== msgId));
      } else if (activePrivateChat) {
        await deletePrivateMessage(msgId);
        setPrivateMessages(prev => ({
          ...prev,
          [activePrivateChat]: (prev[activePrivateChat] || []).filter(m => m.id !== msgId)
        }));
      }
    } catch (err: any) {
      alert("Ошибка удаления: " + err.message);
    }
  };

  // 🔥 Удаление всей переписки
  const handleClearChat = async () => {
    if (!confirm("Удалить ВСЮ переписку? Это действие нельзя отменить.")) return;

    try {
      if (activeChannelId) {
        await clearChannel(activeChannelId);
        setChannelMessages([]);
      } else if (activePrivateChat) {
        await clearPrivateChat(activePrivateChat);
        setPrivateMessages(prev => ({ ...prev, [activePrivateChat]: [] }));
        setPrivateChats(prev => prev.filter(u => u !== activePrivateChat));
        setActivePrivateChat(null);
      }
    } catch (err: any) {
      alert("Ошибка очистки: " + err.message);
    }
  };

  if (!user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', padding: '20px' }}>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem', border: '1px solid #ccc', borderRadius: '8px', width: '100%', maxWidth: '300px' }}>
          <h2 style={{ textAlign: 'center' }}>Вход в F.Poste</h2>
          <input
            type="text"
            placeholder="Ник (мин. 5 символов)"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            style={{ padding: '0.75rem', fontSize: '1rem', borderRadius: '4px', border: '1px solid #ccc' }}
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading} style={{ padding: '0.75rem', fontSize: '1rem', cursor: 'pointer', borderRadius: '4px', backgroundColor: '#2563eb', color: 'white', border: 'none' }}>
            {isLoading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    );
  }

  const currentMessages = activeChannelId 
    ? channelMessages 
    : (activePrivateChat ? (privateMessages[activePrivateChat] || []) : []);

  const isPrivateChat = !!activePrivateChat;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        style={{ position: 'fixed', top: '12px', left: '12px', zIndex: 100, padding: '6px 10px', display: 'none', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '4px', fontSize: '18px', lineHeight: 1 }}
        className="mobile-menu-btn"
      >
        ☰
      </button>

      <div style={{
        width: '280px',
        borderRight: '1px solid #ddd',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f9f9f9',
        position: 'absolute',
        top: 0,
        left: 0,
        height: '100%',
        zIndex: 50,
        transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.3s ease',
      }} className="sidebar-desktop"> 

        <div style={{ padding: '1rem', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Привет, <b>{user.username}</b></span>
          <button onClick={handleLogout} style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'red', fontSize: '0.9rem' }}>Выйти</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Каналы</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {channels.map(ch => (
              <li 
                key={ch.id} 
                onClick={() => selectChannel(ch.id)}
                style={{ 
                  padding: '10px', 
                  cursor: 'pointer', 
                  borderRadius: '4px',
                  backgroundColor: activeChannelId === ch.id ? '#e0e7ff' : 'transparent',
                  marginBottom: '4px'
                }}
              >
                # {ch.name}
              </li>
            ))}
          </ul>

          <h3 style={{ marginTop: '1.5rem', fontSize: '1rem' }}>Личные чаты</h3>
          {privateChats.length === 0 ? (
            <div style={{ color: '#888', fontSize: '0.9rem', padding: '10px' }}>Нет личных чатов</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {privateChats.map(username => (
                <li 
                  key={username} 
                  onClick={() => selectPrivateChat(username)}
                  style={{ 
                    padding: '10px', 
                    cursor: 'pointer', 
                    borderRadius: '4px',
                    backgroundColor: activePrivateChat === username ? '#e0e7ff' : 'transparent',
                    marginBottom: '4px'
                  }}
                >
                  👤 {username}
                </li>
              ))}
            </ul>
          )}
          
          <form onSubmit={(e) => {
            e.preventDefault();
            const target = (e.target as any).newChatUser.value.trim();
            if (target && target !== user.username) {
              if (!privateChats.includes(target)) setPrivateChats(prev => [...prev, target]);
              selectPrivateChat(target);
              (e.target as any).newChatUser.value = '';
            }
          }} style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <input name="newChatUser" placeholder="Ник для ЛС" style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
            <button type="submit" style={{ cursor: 'pointer', padding: '0 12px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: 'white' }}>OK</button>
          </form>
        </div>
      </div>

      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 40 }}
          className="mobile-backdrop"
        />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '0' }} className="main-area">
        <div style={{ padding: '1rem', borderBottom: '1px solid #ddd', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="chat-header">
          <div>
            {activeChannelId ? `# ${channels.find(c => c.id === activeChannelId)?.name}` : `👤 ${activePrivateChat}`}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {sendError && <div style={{ color: 'red', fontSize: '0.8rem' }}>{sendError}</div>}
            {/* 🔥 Кнопка очистки чата */}
            <button 
              onClick={handleClearChat}
              style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer' }}
              title="Удалить всю переписку"
            >
              🗑️ Очистить
            </button>
          </div>
        </div>

        {initError && (
          <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', textAlign: 'center', borderBottom: '1px solid #fca5a5' }}>
            {initError} <button onClick={loadInitialData} style={{ marginLeft: '10px', textDecoration: 'underline', background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer' }}>Повторить</button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {isHistoryLoading ? (
            <div style={{ textAlign: 'center', color: '#888', marginTop: '2rem' }}>Загрузка истории...</div>
          ) : currentMessages.length === 0 ? (
            <div style={{ color: '#888', textAlign: 'center', marginTop: '2rem' }}>Нет сообщений</div>
          ) : (
            currentMessages.map(msg => {
              const isOwn = msg.username === user.username;
              const isEditing = editingMessageId === msg.id;
              
              const label = isPrivateChat 
                ? (isOwn ? 'Вы' : activePrivateChat)
                : msg.username;
              
              return (
                <div key={msg.id} style={{ 
                  alignSelf: isOwn ? 'flex-end' : 'flex-start',
                  backgroundColor: isOwn ? '#d1fae5' : '#f3f4f6',
                  padding: '0.5rem 1rem',
                  borderRadius: '12px',
                  maxWidth: '80%',
                  position: 'relative'
                }}>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: isOwn ? '#059669' : '#6b7280', 
                    marginBottom: '4px',
                    fontWeight: 'bold'
                  }}>
                    {label}
                  </div>
                  
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', resize: 'vertical', minHeight: '60px' }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={cancelEditing} style={{ padding: '4px 12px', fontSize: '0.85rem', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' }}>
                          Отмена
                        </button>
                        <button onClick={saveEdit} style={{ padding: '4px 12px', fontSize: '0.85rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                          Сохранить
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ wordBreak: 'break-word' }}>{msg.text}</div>
                      {msg.file_url && (
                        <a href={msg.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: '4px', color: '#2563eb', fontSize: '0.85rem' }}>
                          📎 {msg.file_name || 'Файл'}
                        </a>
                      )}
                      <div style={{ fontSize: '0.7rem', color: '#999', textAlign: 'right', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>
                          {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {msg.edited && <span style={{ marginLeft: '4px', fontStyle: 'italic' }}>(изменено)</span>}
                        </span>
                        {isOwn && (
                          <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                            <button onClick={() => startEditing(msg)} style={{ padding: '2px 6px', fontSize: '0.7rem', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280' }} title="Редактировать">
                              ✏️
                            </button>
                            <button onClick={() => handleDeleteMessage(msg.id)} style={{ padding: '2px 6px', fontSize: '0.7rem', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#991b1b' }} title="Удалить">
                              🗑️
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} style={{ padding: '1rem', borderTop: '1px solid #ddd', display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={activePrivateChat ? `Сообщение для ${activePrivateChat}...` : "Введите сообщение..."}
            style={{ flex: 1, padding: '0.75rem', borderRadius: '20px', border: '1px solid #ccc', outline: 'none' }}
          />
          <button type="submit" disabled={!inputText.trim() || isHistoryLoading} style={{ padding: '0 1.5rem', borderRadius: '20px', border: 'none', backgroundColor: '#2563eb', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>
            ➤
          </button>
        </form>
      </div>

      <style>{`
        @media (min-width: 769px) {
          .sidebar-desktop { position: relative !important; transform: none !important; }
          .mobile-menu-btn { display: none !important; }
          .mobile-backdrop { display: none !important; }
          .main-area { margin-left: 0 !important; }
        }
        @media (max-width: 768px) {
          .sidebar-desktop { width: 85% !important; max-width: 320px !important; box-shadow: 2px 0 8px rgba(0,0,0,0.2); }
          .mobile-menu-btn { display: block !important; }
          .chat-header { padding-top: 50px !important; }
        }
      `}</style>
    </div>
  );
}
