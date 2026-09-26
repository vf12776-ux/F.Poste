import React, { useState, useEffect, useRef } from 'react';
import { 
  login, getMe, getToken, setToken, clearToken, 
  listChannels, loadHistory, sendMessage, 
  listPrivateChats, loadPrivateHistory, sendPrivateMessage 
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
  channel_id?: string 
}

export default function App() {
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null); // Для отладки

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [channelMessages, privateMessages]);

  const checkAuth = async () => {
    const token = getToken();
    if (token) {
      try {
        const userData = await getMe();
        setUser(userData);
        await loadInitialData();
      } catch (e) {
        console.error("Auth failed", e);
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
      const data = await login(usernameInput.trim(), usernameInput.trim());
      if (data.token) {
        setToken(data.token);
        setUser({ username: data.username || usernameInput.trim(), display_name: data.displayName });
        await loadInitialData();
      }
    } catch (err) {
      alert('Ошибка входа. Проверьте консоль.');
      console.error(err);
    }
    setIsLoading(false);
  };

  const handleLogout = () => {
    clearToken();
    setUser(null);
    setChannelMessages([]);
    setPrivateMessages({});
  };

  const loadInitialData = async () => {
    try {
      // Загружаем каналы
      const chs = await listChannels();
      setChannels(chs || []);
      
      if ((chs || []).length > 0 && !activeChannelId && !activePrivateChat) {
        const general = (chs || []).find((c: Channel) => c.name === 'general') || (chs || [])[0];
        if (general) {
          setActiveChannelId(general.id);
          await loadChannelMessages(general.id);
        }
      }
    } catch (e) { console.error("Channels load error", e); }

    try {
      // Загружаем личные чаты отдельно, чтобы ошибка тут не ломала каналы
      const pChats = await listPrivateChats();
      setPrivateChats(pChats || []);
    } catch (e) { console.error("Private chats load error", e); }
  };

  const loadChannelMessages = async (channelId: string) => {
    try {
      const msgs = await loadHistory(channelId);
      setChannelMessages(msgs || []);
    } catch (err) { console.error(err); }
  };

  const loadPrivateMessages = async (targetUsername: string) => {
    try {
      const msgs = await loadPrivateHistory(targetUsername);
      setPrivateMessages(prev => ({ ...prev, [targetUsername]: msgs || [] }));
    } catch (err) { console.error(err); }
  };

  const selectChannel = async (channelId: string) => {
    setActiveChannelId(channelId);
    setActivePrivateChat(null);
    setIsSidebarOpen(false);
    setInputText('');
    await loadChannelMessages(channelId);
  };

  const selectPrivateChat = async (username: string) => {
    setActivePrivateChat(username);
    setActiveChannelId(null);
    setIsSidebarOpen(false);
    setInputText('');
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
      timestamp: Date.now(),
    };

    const textToSend = inputText.trim();
    setInputText('');
    setErrorStatus(null);

    if (activeChannelId) {
      setChannelMessages(prev => [...prev, newMessage]);
      try {
        await sendMessage(textToSend, user.username, activeChannelId);
      } catch (err) {
        setErrorStatus("Ошибка отправки в канал");
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
      } catch (err) {
        setErrorStatus("Ошибка отправки ЛС");
        setPrivateMessages(prev => ({
          ...prev,
          [activePrivateChat]: (prev[activePrivateChat] || []).filter(m => m.id !== tempId)
        }));
        setInputText(textToSend);
      }
    }
  };

  if (!user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem', border: '1px solid #ccc', borderRadius: '8px' }}>
          <h2>Вход в F.Poste</h2>
          <input type="text" placeholder="Ник (мин. 5 символов)" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} style={{ padding: '0.5rem' }} disabled={isLoading} />
          <button type="submit" disabled={isLoading}>{isLoading ? 'Вход...' : 'Войти'}</button>
        </form>
      </div>
    );
  }

  const currentMessages = activeChannelId ? channelMessages : (activePrivateChat ? (privateMessages[activePrivateChat] || []) : []);
  const getChatName = (chat: any): string => typeof chat === 'string' ? chat : (chat.partner || chat.username || 'Unknown');

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ position: 'fixed', top: '10px', left: '10px', zIndex: 100, padding: '8px', display: 'none' }} className="mobile-menu-btn">☰</button>

      <div style={{ width: '280px', borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', backgroundColor: '#f9f9f9', position: 'absolute', top: 0, left: 0, height: '100%', zIndex: 50, transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.3s ease' }} className="sidebar-desktop"> 
        <div style={{ padding: '1rem', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between' }}>
          <span>Привет, <b>{user.username}</b></span>
          <button onClick={handleLogout} style={{ color: 'red', background: 'none', border: 'none' }}>Выйти</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          <h3>Каналы</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {(channels || []).map(ch => (
              <li key={ch.id} onClick={() => selectChannel(ch.id)} style={{ padding: '8px', cursor: 'pointer', backgroundColor: activeChannelId === ch.id ? '#e0e7ff' : 'transparent' }}># {ch.name}</li>
            ))}
          </ul>
          <h3>Личные чаты</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {(privateChats || []).map((chat: any) => {
              const username = getChatName(chat);
              return <li key={username} onClick={() => selectPrivateChat(username)} style={{ padding: '8px', cursor: 'pointer', backgroundColor: activePrivateChat === username ? '#e0e7ff' : 'transparent' }}>👤 {username}</li>;
            })}
          </ul>
          <form onSubmit={(e) => { e.preventDefault(); const t = (e.target as any).newChatUser.value.trim(); if(t && t !== user.username) { if(!(privateChats||[]).map(getChatName).includes(t)) setPrivateChats(p => [...p, t]); selectPrivateChat(t); (e.target as any).newChatUser.value=''; } }} style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <input name="newChatUser" placeholder="Ник для ЛС" style={{ flex: 1, padding: '4px' }} />
            <button type="submit">OK</button>
          </form>
        </div>
      </div>

      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 40 }} className="mobile-backdrop" />}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }} className="main-area">
        <div style={{ padding: '1rem', borderBottom: '1px solid #ddd', fontWeight: 'bold' }}>
          {activeChannelId ? `# ${(channels || []).find(c => c.id === activeChannelId)?.name}` : `👤 ${activePrivateChat}`}
          {errorStatus && <span style={{ color: 'red', fontSize: '0.8rem', marginLeft: '10px' }}>{errorStatus}</span>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {(!currentMessages || currentMessages.length === 0) && <div style={{ textAlign: 'center', color: '#888', marginTop: '2rem' }}>Нет сообщений</div>}
          {(currentMessages || []).map(msg => (
            <div key={msg.id} style={{ alignSelf: msg.username === user?.username ? 'flex-end' : 'flex-start', backgroundColor: msg.username === user?.username ? '#d1fae5' : '#f3f4f6', padding: '0.5rem 1rem', borderRadius: '12px', maxWidth: '70%' }}>
              {msg.username !== user?.username && <div style={{ fontSize: '0.75rem', color: '#666' }}>{msg.username}</div>}
              <div>{msg.text}</div>
              {msg.file_url && <a href={msg.file_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontSize: '0.85rem' }}>📎 {msg.file_name}</a>}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} style={{ padding: '1rem', borderTop: '1px solid #ddd', display: 'flex', gap: '0.5rem' }}>
          <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder={activePrivateChat ? `Сообщение для ${activePrivateChat}...` : "Введите сообщение..."} style={{ flex: 1, padding: '0.75rem', borderRadius: '20px', border: '1px solid #ccc' }} />
          <button type="submit" disabled={!inputText.trim()} style={{ padding: '0 1.5rem', borderRadius: '20px', border: 'none', backgroundColor: '#2563eb', color: 'white' }}>➤</button>
        </form>
      </div>

      <style>{`
        @media (min-width: 769px) { .sidebar-desktop { position: relative !important; transform: none !important; } .mobile-menu-btn, .mobile-backdrop { display: none !important; } }
        @media (max-width: 768px) { .sidebar-desktop { width: 80% !important; max-width: 300px !important; box-shadow: 2px 0 8px rgba(0,0,0,0.1); } }
      `}</style>
    </div>
  );
}
