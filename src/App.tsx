import React, { useState, useEffect, useRef } from 'react';
import { 
  login, getMe, getToken, setToken, clearToken, 
  listChannels, loadHistory, sendMessage, editMessage, deleteMessage, clearChannel,
  listPrivateChats, loadPrivateHistory, sendPrivateMessage, editPrivateMessage, 
  deletePrivateMessage, clearPrivateChat, uploadFile
} from './api';

interface User { username: string; display_name?: string }
interface Channel { id: string; name: string }
interface Message { 
  id: string; 
  username: string; 
  text: string; 
  fileUrl?: string; 
  fileName?: string; 
  timestamp: number; 
  channelId?: string;
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
  const [isUploading, setIsUploading] = useState(false);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('fposte_dark_mode') === 'true';
  });

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { checkAuth(); }, []);
  
  useEffect(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [channelMessages, privateMessages, activeChannelId, activePrivateChat]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('fposte_dark_mode', String(isDarkMode));
  }, [isDarkMode]);

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
    if ((!inputText.trim() && !audioBlob) || !user) return;

    const tempId = `temp-${Date.now()}`;
    const textToSend = inputText.trim();
    let file_url = '';
    let file_name = '';

    if (audioBlob) {
      setIsUploading(true);
      try {
        const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
        const uploaded = await uploadFile(audioFile);
        file_url = uploaded.url;
        file_name = uploaded.name;
      } catch (err) {
        alert('Ошибка загрузки аудио');
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

        const newMessage: Message = {
      id: tempId,
      username: user.username,
      text: textToSend,
      fileUrl: file_url || undefined,
      fileName: file_name || undefined,
      timestamp: Math.floor(Date.now() / 1000),
    };

    setInputText('');
    setSendError(null);
    resetAudioRecording();

    if (activeChannelId) {
      setChannelMessages(prev => [...prev, newMessage]);
      try {
        await sendMessage(textToSend, user.username, activeChannelId, file_url, file_name);
      } catch (err: any) {
        setSendError("Ошибка: " + err.message);
        setChannelMessages(prev => prev.filter(m => m.id !== tempId));
      }
    } else if (activePrivateChat) {
      setPrivateMessages(prev => ({
        ...prev,
        [activePrivateChat]: [...(prev[activePrivateChat] || []), newMessage]
      }));
      try {
        await sendPrivateMessage(activePrivateChat, textToSend, file_url, file_name);
        if (!privateChats.includes(activePrivateChat)) {
          setPrivateChats(prev => [...prev, activePrivateChat]);
        }
      } catch (err: any) {
        setSendError("Ошибка ЛС: " + err.message);
        setPrivateMessages(prev => ({
          ...prev,
          [activePrivateChat]: (prev[activePrivateChat] || []).filter(m => m.id !== tempId)
        }));
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);
    try {
      const uploaded = await uploadFile(file);
      const tempId = `temp-${Date.now()}`;
            const newMessage: Message = {
        id: tempId,
        username: user.username,
        text: '',
        fileUrl: uploaded.url,
        fileName: uploaded.name,
        timestamp: Math.floor(Date.now() / 1000),
      };

      if (activeChannelId) {
        setChannelMessages(prev => [...prev, newMessage]);
        await sendMessage('', user.username, activeChannelId, uploaded.url, uploaded.name);
      } else if (activePrivateChat) {
        setPrivateMessages(prev => ({
          ...prev,
          [activePrivateChat]: [...(prev[activePrivateChat] || []), newMessage]
        }));
        await sendPrivateMessage(activePrivateChat, '', uploaded.url, uploaded.name);
        if (!privateChats.includes(activePrivateChat)) {
          setPrivateChats(prev => [...prev, activePrivateChat]);
        }
      }
    } catch (err: any) {
      alert('Ошибка загрузки файла: ' + err.message);
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      alert('Не удалось получить доступ к микрофону');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    resetAudioRecording();
  };

  const resetAudioRecording = () => {
    setAudioBlob(null);
    if (audioPreviewUrl) { URL.revokeObjectURL(audioPreviewUrl); }
    setAudioPreviewUrl(null);
    setRecordingTime(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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
        setChannelMessages(prev => prev.map(m => m.id === editingMessageId ? { ...m, text: editingText.trim(), edited: true } : m));
      } else if (activePrivateChat) {
        await editPrivateMessage(editingMessageId, editingText.trim());
        setPrivateMessages(prev => ({
          ...prev,
          [activePrivateChat]: (prev[activePrivateChat] || []).map(m => m.id === editingMessageId ? { ...m, text: editingText.trim(), edited: true } : m)
        }));
      }
      cancelEditing();
    } catch (err: any) {
      alert("Ошибка редактирования: " + err.message);
    }
  };

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

  const getFileType = (fileName: string): 'image' | 'audio' | 'video' | 'other' => {
    const ext = fileName.toLowerCase().split('.').pop() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
    if (['mp3', 'wav', 'ogg', 'webm', 'm4a', 'aac'].includes(ext)) return 'audio';
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
    return 'other';
  };

  if (!user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', padding: '20px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem', border: '1px solid var(--border)', borderRadius: '8px', width: '100%', maxWidth: '300px', backgroundColor: 'var(--bg-secondary)' }}>
          <h2 style={{ textAlign: 'center', color: 'var(--text-primary)' }}>Вход в F.Poste</h2>
          <input type="text" placeholder="Ник (мин. 5 символов)" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} style={{ padding: '0.75rem', fontSize: '1rem', borderRadius: '4px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }} disabled={isLoading} />
          <button type="submit" disabled={isLoading} style={{ padding: '0.75rem', fontSize: '1rem', cursor: 'pointer', borderRadius: '4px', backgroundColor: 'var(--accent)', color: 'white', border: 'none' }}>
            {isLoading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    );
  }

  const currentMessages = activeChannelId ? channelMessages : (activePrivateChat ? (privateMessages[activePrivateChat] || []) : []);
  const isPrivateChat = !!activePrivateChat;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', overflow: 'hidden', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ position: 'fixed', top: '12px', left: '12px', zIndex: 100, padding: '6px 10px', display: 'none', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '18px', lineHeight: 1, color: 'var(--text-primary)' }} className="mobile-menu-btn">☰</button>

      <div style={{ width: '280px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-secondary)', position: 'absolute', top: 0, left: 0, height: '100%', zIndex: 50, transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.3s ease' }} className="sidebar-desktop"> 
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Привет, <b>{user.username}</b></span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => setIsDarkMode(!isDarkMode)} style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: '1.2rem' }} title={isDarkMode ? 'Светлая тема' : 'Темная тема'}>
              {isDarkMode ? '☀️' : '🌙'}
            </button>
            <button onClick={handleLogout} style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'red', fontSize: '0.9rem' }}>Выйти</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          <h3 style={{ marginTop: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Каналы</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {channels.map(ch => (
              <li key={ch.id} onClick={() => selectChannel(ch.id)} style={{ padding: '10px', cursor: 'pointer', borderRadius: '4px', backgroundColor: activeChannelId === ch.id ? 'var(--highlight)' : 'transparent', marginBottom: '4px', color: 'var(--text-primary)' }}># {ch.name}</li>
            ))}
          </ul>

          <h3 style={{ marginTop: '1.5rem', fontSize: '1rem', color: 'var(--text-primary)' }}>Личные чаты</h3>
          {privateChats.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '10px' }}>Нет личных чатов</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {privateChats.map(username => (
                <li key={username} onClick={() => selectPrivateChat(username)} style={{ padding: '10px', cursor: 'pointer', borderRadius: '4px', backgroundColor: activePrivateChat === username ? 'var(--highlight)' : 'transparent', marginBottom: '4px', color: 'var(--text-primary)' }}>👤 {username}</li>
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
            <input name="newChatUser" placeholder="Ник для ЛС" style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }} />
            <button type="submit" style={{ cursor: 'pointer', padding: '0 12px', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>OK</button>
          </form>
        </div>
      </div>

      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40 }} className="mobile-backdrop" />}

      <div className="main-area">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="chat-header">
          <div style={{ color: 'var(--text-primary)' }}>
            {activeChannelId ? `# ${channels.find(c => c.id === activeChannelId)?.name}` : `👤 ${activePrivateChat}`}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {sendError && <div style={{ color: 'var(--error-text)', fontSize: '0.8rem' }}>{sendError}</div>}
            <button onClick={handleClearChat} style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', border: '1px solid var(--error-border)', borderRadius: '4px', cursor: 'pointer' }}>🗑️ Очистить</button>
          </div>
        </div>

        {initError && (
          <div style={{ padding: '1rem', backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', textAlign: 'center', borderBottom: '1px solid var(--error-border)' }}>
            {initError} <button onClick={loadInitialData} style={{ marginLeft: '10px', textDecoration: 'underline', background: 'none', border: 'none', color: 'var(--error-text)', cursor: 'pointer' }}>Повторить</button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {isHistoryLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>Загрузка истории...</div>
          ) : currentMessages.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '2rem' }}>Нет сообщений</div>
          ) : (
            currentMessages.map(msg => {
              const isOwn = msg.username === user.username;
              const isEditing = editingMessageId === msg.id;
              const label = isPrivateChat ? (isOwn ? 'Вы' : activePrivateChat) : msg.username;
              
                return (
    <div className="app-container">
      <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="mobile-menu-btn">☰</button>

      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}> 
        <div className="sidebar-header">
          <span>Привет, <b>{user.username}</b></span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => setIsDarkMode(!isDarkMode)} style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: '1.2rem' }} title={isDarkMode ? 'Светлая тема' : 'Темная тема'}>
              {isDarkMode ? '☀️' : '🌙'}
            </button>
            <button onClick={handleLogout} style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'red', fontSize: '0.9rem' }}>Выйти</button>
          </div>
        </div>

        <div className="sidebar-content">
          <h3>Каналы</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {channels.map(ch => (
              <li key={ch.id} onClick={() => selectChannel(ch.id)} className={`channel-item ${activeChannelId === ch.id ? 'active' : ''}`}># {ch.name}</li>
            ))}
          </ul>

          <h3>Личные чаты</h3>
          {privateChats.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '10px' }}>Нет личных чатов</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {privateChats.map(username => (
                <li key={username} onClick={() => selectPrivateChat(username)} className={`chat-item ${activePrivateChat === username ? 'active' : ''}`}>👤 {username}</li>
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
            <input name="newChatUser" placeholder="Ник для ЛС" style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }} />
            <button type="submit" style={{ cursor: 'pointer', padding: '0 12px', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>OK</button>
          </form>
        </div>
      </div>

      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="mobile-backdrop" />}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '0' }} className="main-area">
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="chat-header">
          <div style={{ color: 'var(--text-primary)' }}>
            {activeChannelId ? `# ${channels.find(c => c.id === activeChannelId)?.name}` : `👤 ${activePrivateChat}`}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {sendError && <div style={{ color: 'var(--error-text)', fontSize: '0.8rem' }}>{sendError}</div>}
            <button onClick={handleClearChat} style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', border: '1px solid var(--error-border)', borderRadius: '4px', cursor: 'pointer' }}>🗑️ Очистить</button>
          </div>
        </div>

        {initError && (
          <div style={{ padding: '1rem', backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', textAlign: 'center', borderBottom: '1px solid var(--error-border)' }}>
            {initError} <button onClick={loadInitialData} style={{ marginLeft: '10px', textDecoration: 'underline', background: 'none', border: 'none', color: 'var(--error-text)', cursor: 'pointer' }}>Повторить</button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {isHistoryLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>Загрузка истории...</div>
          ) : currentMessages.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '2rem' }}>Нет сообщений</div>
          ) : (
            currentMessages.map(msg => {
              const isOwn = msg.username === user.username;
              const isEditing = editingMessageId === msg.id;
              const label = isPrivateChat ? (isOwn ? 'Вы' : activePrivateChat) : msg.username;
                return (
    <div className="app-container">
      <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="mobile-menu-btn">☰</button>

      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}> 
        <div className="sidebar-header">
          <span>Привет, <b>{user.username}</b></span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="btn-icon" title={isDarkMode ? 'Светлая тема' : 'Темная тема'}>
              {isDarkMode ? '☀️' : '🌙'}
            </button>
            <button onClick={handleLogout} className="btn btn-danger" style={{ fontSize: '0.9rem' }}>Выйти</button>
          </div>
        </div>

        <div className="sidebar-content">
          <h3>Каналы</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {channels.map(ch => (
              <li key={ch.id} onClick={() => selectChannel(ch.id)} className={`channel-item ${activeChannelId === ch.id ? 'active' : ''}`}># {ch.name}</li>
            ))}
          </ul>

          <h3>Личные чаты</h3>
          {privateChats.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '10px' }}>Нет личных чатов</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {privateChats.map(username => (
                <li key={username} onClick={() => selectPrivateChat(username)} className={`chat-item ${activePrivateChat === username ? 'active' : ''}`}>👤 {username}</li>
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
            <input name="newChatUser" placeholder="Ник для ЛС" className="input-field" />
            <button type="submit" className="btn" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>OK</button>
          </form>
        </div>
      </div>

      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="mobile-backdrop" />}

      <div className="main-area">
        <div className="chat-header">
          <div>
            {activeChannelId ? `# ${channels.find(c => c.id === activeChannelId)?.name}` : `👤 ${activePrivateChat}`}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {sendError && <div style={{ color: 'var(--error-text)', fontSize: '0.8rem' }}>{sendError}</div>}
            <button onClick={handleClearChat} className="btn btn-danger" style={{ fontSize: '0.75rem' }}>🗑️ Очистить</button>
          </div>
        </div>

        {initError && (
          <div style={{ padding: '1rem', backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', textAlign: 'center', borderBottom: '1px solid var(--error-border)' }}>
            {initError} <button onClick={loadInitialData} style={{ marginLeft: '10px', textDecoration: 'underline', background: 'none', border: 'none', color: 'var(--error-text)', cursor: 'pointer' }}>Повторить</button>
          </div>
        )}

        <div className="messages-container">
          {isHistoryLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>Загрузка истории...</div>
          ) : currentMessages.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '2rem' }}>Нет сообщений</div>
          ) : (
            currentMessages.map(msg => {
              const isOwn = msg.username === user.username;
              const isEditing = editingMessageId === msg.id;
              const label = isPrivateChat ? (isOwn ? 'Вы' : activePrivateChat) : msg.username;
              
              return (
                <div key={msg.id} className={`message ${isOwn ? 'own' : 'other'}`}>
                  <div className="message-author">{label}</div>
                  
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} className="input-field" style={{ resize: 'vertical', minHeight: '60px' }} autoFocus />
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={cancelEditing} className="btn" style={{ backgroundColor: 'var(--bg-other-message)', color: 'var(--text-primary)' }}>Отмена</button>
                        <button onClick={saveEdit} className="btn btn-primary">Сохранить</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {msg.text && <div className="message-text">{msg.text}</div>}
                      {msg.fileUrl && msg.fileName && (
                        <div className="message-attachment">
                          {getFileType(msg.fileName) === 'image' && <img src={msg.fileUrl} alt={msg.fileName} onClick={() => window.open(msg.fileUrl, '_blank')} />}
                          {getFileType(msg.fileName) === 'audio' && <audio controls src={msg.fileUrl} />}
                          {getFileType(msg.fileName) === 'video' && <video controls src={msg.fileUrl} />}
                          {getFileType(msg.fileName) === 'other' && <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">📎 {msg.fileName}</a>}
                        </div>
                      )}
                      <div className="message-meta">
                        <span>{new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{msg.edited && <span style={{ marginLeft: '4px', fontStyle: 'italic' }}>(изменено)</span>}</span>
                        {isOwn && (
                          <div className="message-actions">
                            {!msg.fileUrl && <button onClick={() => startEditing(msg)} title="Редактировать">✏️</button>}
                            <button onClick={() => handleDeleteMessage(msg.id)} title="Удалить">🗑️</button>
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

        {(isRecording || audioBlob) && (
          <div className="recording-panel">
            {isRecording ? (
              <>
                <div className="recording-indicator" />
                <span style={{ fontWeight: 'bold' }}>{formatTime(recordingTime)}</span>
                <button onClick={cancelRecording} className="btn btn-danger">❌ Отмена</button>
                <button onClick={stopRecording} className="btn btn-primary">⏹️ Стоп</button>
              </>
            ) : audioBlob && (
              <>
                <audio controls src={audioPreviewUrl || ''} style={{ flex: 1, maxWidth: '300px' }} />
                <button onClick={resetAudioRecording} className="btn btn-danger">❌</button>
              </>
            )}
          </div>
        )}

        <form onSubmit={handleSendMessage} className="input-area">
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt" />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="btn-icon" title="Прикрепить файл">📎</button>
          <button type="button" onClick={isRecording ? stopRecording : startRecording} disabled={isUploading} className="btn-icon" title={isRecording ? 'Остановить запись' : 'Записать голосовое сообщение'}>{isRecording ? '⏹️' : '🎤'}</button>
          <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder={activePrivateChat ? `Сообщение для ${activePrivateChat}...` : "Введите сообщение..."} className="input-field" disabled={isUploading} />
          <button type="submit" disabled={(!inputText.trim() && !audioBlob) || isUploading} className="send-btn">{isUploading ? '⏳' : '➤'}</button>
        </form>
      </div>
    </div>
  );
}            
