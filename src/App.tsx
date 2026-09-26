import React, { useState, useEffect, useRef } from 'react';
import { getMe, getToken, clearToken, listChannels, loadHistory, sendMessage, listPrivateChats, loadPrivateHistory, sendPrivateMessage } from './api';

// --- Типы данных ---
interface User { username: string; display_name?: string }
interface Channel { id: string; name: string }
interface Message { id: string; username: string; text: string; file_url?: string; file_name?: string; timestamp: number; channel_id?: string }

export default function App() {
  // --- Состояния ---
  const [user, setUser] = useState<User | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [channelMessages, setChannelMessages] = useState<Message[]>([]);

  const [privateChats, setPrivateChats] = useState<string[]>([]);
  const [activePrivateChat, setActivePrivateChat] = useState<string | null>(null);
  const [privateMessages, setPrivateMessages] = useState<Record<string, Message[]>>({});

  const [inputText, setInputText] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Для мобильного UI

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Эффекты ---
  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channelMessages, privateMessages, activeChannelId, activePrivateChat]);

  // --- Логика авторизации ---
  const checkAuth = async () => {
    const token = getToken();
    if (token) {
      try {
        const userData = await getMe();
        setUser(userData);
        await loadInitialData();
      } catch {
        clearToken();
      }
    }
    setIsLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameInput.trim().length < 5) return alert('Минимум 5 символов');
    setIsLoading(true);
    try {
      // Предполагается, что api.login возвращает токен и данные пользователя
      // Если ваш api.ts называет это иначе, замените на ваш вызов
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput.trim() })
      });
      const data = await response.json();
      if (data.token) {
        localStorage.setItem('token', data.token);
        setUser({ username: data.username });
        await loadInitialData();
      }
    } catch (err) {
      alert('Ошибка входа');
    }
    setIsLoading(false);
  };

  const handleLogout = () => {
    clearToken();
    setUser(null);
    setChannelMessages([]);
    setPrivateMessages({});
  };

  // --- Загрузка данных ---
  const loadInitialData = async () => {
    try {
      const chs = await listChannels();
      setChannels(chs);
      if (chs.length > 0 && !activeChannelId && !activePrivateChat) {
        const general = chs.find((c: Channel) => c.name === 'general') || chs[0];
        setActiveChannelId(general.id);
        await loadChannelMessages(general.id);
      }
      const pChats = await listPrivateChats();
      setPrivateChats(pChats);
    } catch (err) {
      console.error('Ошибка загрузки данных:', err);
    }
  };

  const loadChannelMessages = async (channelId: string) => {
    try {
      const msgs = await loadHistory(channelId);
      setChannelMessages(msgs);
    } catch (err) {
      console.error('Ошибка загрузки истории канала:', err);
    }
  };

  const loadPrivateMessages = async (targetUsername: string) => {
    try {
      const msgs = await loadPrivateHistory(targetUsername);
      setPrivateMessages(prev => ({ ...prev, [targetUsername]: msgs }));
    } catch (err) {
      console.error('Ошибка загрузки истории ЛС:', err);
    }
  };

  // --- Обработчики переключения ---
  const selectChannel = async (channelId: string) => {
    setActiveChannelId(channelId);
    setActivePrivateChat(null);
    setIsSidebarOpen(false); // Закрываем сайдбар на мобильном
    setInputText('');
    await loadChannelMessages(channelId);
  };

  const selectPrivateChat = async (username: string) => {
    setActivePrivateChat(username);
    setActiveChannelId(null);
    setIsSidebarOpen(false); // Закрываем сайдбар на мобильном
    setInputText('');
    if (!privateMessages[username]) {
      await loadPrivateMessages(username);
    }
  };

  // --- Отправка сообщений (Приоритет №2: Оптимистичное обновление) ---
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault(); // Критично: предотвращает перезагрузку страницы и сброс в #general
    if (!inputText.trim() || !user) return;

    const tempId = `temp-${Date.now()}`;
    const newMessage: Message = {
      id: tempId,
      username: user.username,
      text: inputText.trim(),
      timestamp: Date.now(),
    };

    const textToSend = inputText.trim();
    setInputText(''); // Очищаем поле сразу

    if (activeChannelId) {
      // 1. Оптимистично добавляем в UI
      setChannelMessages(prev => [...prev, newMessage]);
      try {
        await sendMessage(activeChannelId, textToSend);
        // После успеха можно перезагрузить историю для синхронизации ID, 
        // но для скорости оставляем оптимистичное сообщение (сервер должен вернуть тот же текст)
      } catch (err) {
        alert('Ошибка отправки');
        setChannelMessages(prev => prev.filter(m => m.id !== tempId)); // Откат при ошибке
      }
    } else if (activePrivateChat) {
      // 1. Оптимистично добавляем в UI
      setPrivateMessages(prev => ({
        ...prev,
        [activePrivateChat]: [...(prev[activePrivateChat] || []), newMessage]
      }));
      try {
        await sendPrivateMessage(activePrivateChat, textToSend);
      } catch (err) {
        alert('Ошибка отправки ЛС');
        setPrivateMessages(prev => ({
          ...prev,
          [activePrivateChat]: (prev[activePrivateChat] || []).filter(m => m.id !== tempId)
        }));
      }
    }
  };

  // --- Рендер: Экран входа ---
  if (!user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem', border: '1px solid #ccc', borderRadius: '8px' }}>
          <h2>Вход в F.Poste</h2>
          <input
            type="text"
            placeholder="Введите ник (мин. 5 символов)"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            style={{ padding: '0.5rem', fontSize: '1rem' }}
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading} style={{ padding: '0.5rem', fontSize: '1rem', cursor: 'pointer' }}>
            {isLoading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    );
  }

  // --- Рендер: Основной интерфейс ---
  const currentMessages = activeChannelId 
    ? channelMessages 
    : (activePrivateChat ? (privateMessages[activePrivateChat] || []) : []);

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      {/* Мобильная кнопка меню */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        style={{ position: 'fixed', top: '10px', left: '10px', zIndex: 100, padding: '8px', display: 'none' }}
        className="mobile-menu-btn" // Добавьте в CSS: @media (max-width: 768px) { .mobile-menu-btn { display: block !important; } }
      >
        ☰
      </button>

      {/* Сайдбар */}
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
      {/* Добавьте в CSS: @media (min-width: 769px) { .sidebar-desktop { position: relative !important; transform: none !important; } } */}

        <div style={{ padding: '1rem', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Привет, <b>{user.username}</b></span>
          <button onClick={handleLogout} style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'red' }}>Выйти</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Каналы</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {channels.map(ch => (
              <li 
                key={ch.id} 
                onClick={() => selectChannel(ch.id)}
                style={{ 
                  padding: '8px', 
                  cursor: 'pointer', 
                  borderRadius: '4px',
                  backgroundColor: activeChannelId === ch.id ? '#e0e7ff' : 'transparent'
                }}
              >
                # {ch.name}
              </li>
            ))}
          </ul>

          <h3>Личные чаты</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {privateChats.map(username => (
              <li 
                key={username} 
                onClick={() => selectPrivateChat(username)}
                style={{ 
                  padding: '8px', 
                  cursor: 'pointer', 
                  borderRadius: '4px',
                  backgroundColor: activePrivateChat === username ? '#e0e7ff' : 'transparent'
                }}
              >
                👤 {username}
              </li>
            ))}
          </ul>
          
          {/* Простая форма начала нового ЛС */}
          <form onSubmit={(e) => {
            e.preventDefault();
            const target = (e.target as any).newChatUser.value.trim();
            if (target && target !== user.username) {
              if (!privateChats.includes(target)) setPrivateChats(prev => [...prev, target]);
              selectPrivateChat(target);
              (e.target as any).newChatUser.value = '';
            }
          }} style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <input name="newChatUser" placeholder="Ник для ЛС" style={{ flex: 1, padding: '4px' }} />
            <button type="submit" style={{ cursor: 'pointer' }}>OK</button>
          </form>
        </div>
      </div>

      {/* Затемнение фона для мобильного меню */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 40 }}
          className="mobile-backdrop"
        />
      )}

      {/* Основная область чата */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '0' }} className="main-area">
        {/* Заголовок чата */}
        <div style={{ padding: '1rem', borderBottom: '1px solid #ddd', fontWeight: 'bold' }}>
          {activeChannelId ? `# ${channels.find(c => c.id === activeChannelId)?.name}` : `👤 ${activePrivateChat}`}
        </div>

        {/* Список сообщений */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {currentMessages.length === 0 && <div style={{ color: '#888', textAlign: 'center', marginTop: '2rem' }}>Нет сообщений</div>}
          {currentMessages.map(msg => (
            <div key={msg.id} style={{ 
              alignSelf: msg.username === user.username ? 'flex-end' : 'flex-start',
              backgroundColor: msg.username === user.username ? '#d1fae5' : '#f3f4f6',
              padding: '0.5rem 1rem',
              borderRadius: '12px',
              maxWidth: '70%'
            }}>
              {msg.username !== user.username && <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '2px' }}>{msg.username}</div>}
              <div>{msg.text}</div>
              {msg.file_url && (
                <a href={msg.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: '4px', color: '#2563eb', fontSize: '0.85rem' }}>
                  📎 {msg.file_name || 'Файл'}
                </a>
              )}
              <div style={{ fontSize: '0.7rem', color: '#999', textAlign: 'right', marginTop: '4px' }}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Форма ввода */}
        <form onSubmit={handleSendMessage} style={{ padding: '1rem', borderTop: '1px solid #ddd', display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={activePrivateChat ? `Сообщение для ${activePrivateChat}...` : "Введите сообщение..."}
            style={{ flex: 1, padding: '0.75rem', borderRadius: '20px', border: '1px solid #ccc', outline: 'none' }}
          />
          <button type="submit" disabled={!inputText.trim()} style={{ padding: '0 1.5rem', borderRadius: '20px', border: 'none', backgroundColor: '#2563eb', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>
            ➤
          </button>
        </form>
      </div>

      {/* Глобальные стили для адаптивности (в идеале вынести в index.css) */}
      <style>{`
        @media (min-width: 769px) {
          .sidebar-desktop { position: relative !important; transform: none !important; }
          .mobile-menu-btn { display: none !important; }
          .mobile-backdrop { display: none !important; }
          .main-area { margin-left: 0 !important; }
        }
        @media (max-width: 768px) {
          .sidebar-desktop { width: 80% !important; max-width: 300px !important; box-shadow: 2px 0 8px rgba(0,0,0,0.1); }
        }
      `}</style>
    </div>
  );
}
