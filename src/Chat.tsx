import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

interface Message {
  id: string;
  username: string;
  text: string;
  type: string;
  timestamp: number;
  is_file?: boolean;
  file_name?: string;
  fileUrl?: string;
}

const Chat: React.FC<{ username: string }> = ({ username }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [currentRoom, setCurrentRoom] = useState('public');
  const [rooms, setRooms] = useState<string[]>(['public']);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkTheme, setDarkTheme] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();
    const subscription = subscribeToMessages();
    return () => {
      supabase.removeChannel(subscription);
    };
  }, [currentRoom]);

  const loadMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('timestamp', { ascending: true })
      .limit(200);
    
    if (error) {
      console.error('Ошибка загрузки:', error);
    } else if (data) {
      setMessages(data as Message[]);
    }
  };

  const subscribeToMessages = () => {
    return supabase
      .channel(`room:${currentRoom}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    
    const newMsg = {
      id: crypto.randomUUID(),
      username: username,
      text: inputText.trim(),
      type: 'msg',
      timestamp: Date.now(),
    };
    
    const { error } = await supabase.from('messages').insert(newMsg);
    
    if (error) {
      alert('Ошибка отправки: ' + error.message);
    } else {
      setInputText('');
    }
  };

  const switchRoom = (room: string) => {
    setCurrentRoom(room);
    setMessages([]);
    setSidebarOpen(false);
  };

  const createPrivateChat = () => {
    const other = prompt('Имя собеседника:');
    if (!other || other === username) return;
    const sorted = [username, other].sort();
    const roomName = `private_${sorted[0]}_${sorted[1]}`;
    setRooms((prev) => (prev.includes(roomName) ? prev : [...prev, roomName]));
    switchRoom(roomName);
  };

  const getRoomDisplayName = (room: string) => {
    if (room === 'public') return 'Общий чат';
    const match = room.match(/^private_(.+)_(.+)$/);
    if (match) return `Чат с ${match[1] === username ? match[2] : match[1]}`;
    return room;
  };

  return (
    <div className={`chat-container ${darkTheme ? 'dark-theme' : ''}`}>
      <button className="menu-btn" onClick={() => setSidebarOpen(true)}>☰</button>
      
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h3>Диалоги</h3>
          <button className="close-sidebar" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>
        <button className="new-chat-btn" onClick={createPrivateChat}>+ Приватный чат</button>
        <div className="rooms-list">
          {rooms.map((room) => (
            <div
              key={room}
              className={`room-item ${currentRoom === room ? 'active' : ''}`}
              onClick={() => switchRoom(room)}
            >
              <span>{getRoomDisplayName(room)}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className={`overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
      
      <div className="chat-main">
        <div className="chat-header">
          <h2>{getRoomDisplayName(currentRoom)}</h2>
          <button onClick={() => setDarkTheme((prev) => !prev)} className="theme-toggle-btn">
            {darkTheme ? '☀️' : '🌙'}
          </button>
        </div>
        
        <div className="messages-area">
          {messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.username === username ? 'own' : 'other'}`}>
              <div className="message-header">
                <strong>{msg.username}</strong>
                <span className="message-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="message-content">
                <p>{msg.text}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        
        <div className="input-area">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Сообщение..."
          />
          <button onClick={sendMessage} className="send-btn">➤</button>
        </div>
      </div>
    </div>
  );
};

export default Chat;