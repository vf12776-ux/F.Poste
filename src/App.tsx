import React, { useState, useEffect, useRef } from 'react';
import { 
  login, 
  getMe, 
  listPrivateChats, 
  loadPrivateHistory, 
  sendPrivateMessage, 
  uploadFile, 
  subscribeToPrivateMessages,
  unsubscribeFromChannel,
  clearToken
} from './api';

interface User {
  username: string;
  displayName: string;
}

interface Message {
  id: string;
  username: string;
  text: string;
  timestamp: string;
  fileUrl?: string;
  fileName?: string;
  to_username?: string;
  from_username?: string;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [chats, setChats] = useState<string[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    const init = async () => {
      const me = await getMe();
      if (me) {
        setUser(me);
        loadChats();
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (user && activeChat) {
      if (subscriptionRef.current) {
        unsubscribeFromChannel(subscriptionRef.current);
      }
      
      subscriptionRef.current = subscribeToPrivateMessages(user.username, (newMsg: any) => {
        if (newMsg.from_username === activeChat || newMsg.to_username === activeChat) {
          setMessages(prev => [...prev, {
            id: newMsg.id,
            username: newMsg.from_username,
            text: newMsg.text,
            timestamp: newMsg.timestamp,
            fileUrl: newMsg.file_url,
            fileName: newMsg.file_name,
            to_username: newMsg.to_username,
            from_username: newMsg.from_username
          }]);
        }
      });
    }
    return () => {
      if (subscriptionRef.current) unsubscribeFromChannel(subscriptionRef.current);
    };
  }, [user, activeChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(usernameInput, displayNameInput);
      const me = await getMe();
      if (me) {
        setUser(me);
        loadChats();
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadChats = async () => {
    const chatList = await listPrivateChats();
    setChats(chatList);
  };

  const openChat = async (partner: string) => {
    setActiveChat(partner);
    setLoading(true);
    const history = await loadPrivateHistory(partner);
    setMessages(history);
    setLoading(false);
  };

  const handleSend = async () => {
    if (!inputText.trim() || !activeChat || !user) return;
    
    const tempId = Date.now().toString();
    const optimisticMsg: Message = {
      id: tempId,
      username: user.username,
      text: inputText,
      timestamp: new Date().toISOString(),
      to_username: activeChat,
      from_username: user.username
    };
    
    setMessages(prev => [...prev, optimisticMsg]);
    setInputText('');
    
    try {
      await sendPrivateMessage(activeChat, inputText);
    } catch (err) {
      console.error("Send failed", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !activeChat) return;
    
    const file = e.target.files[0];
    setUploading(true);
    
    try {
      const { url, name } = await uploadFile(file);
      await sendPrivateMessage(activeChat, `Файл: ${name}`, url, name);
    } catch (err) {
      alert("Ошибка загрузки файла");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLogout = () => {
    clearToken();
    window.location.reload();
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <form onSubmit={handleLogin} className="p-8 bg-white rounded-lg shadow-md w-96">
          <h2 className="text-2xl font-bold mb-4 text-center">Вход в F.Poste</h2>
          <input
            type="text"
            placeholder="Имя пользователя (мин. 3 символа)"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            className="w-full p-2 mb-4 border rounded"
            required
            minLength={3}
          />
          <input
            type="text"
            placeholder="Отображаемое имя"
            value={displayNameInput}
            onChange={(e) => setDisplayNameInput(e.target.value)}
            className="w-full p-2 mb-4 border rounded"
            required
          />
          <button 
            type="submit" 
            disabled={loading}
            className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
          >
            {loading ? 'Входим...' : 'Войти'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-1/3 bg-white border-r overflow-y-auto">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <span className="font-bold">{user.displayName}</span>
          <button onClick={handleLogout} className="text-sm text-red-500">Выйти</button>
        </div>
        <div className="p-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Чаты</h3>
          {chats.length === 0 ? (
            <p className="text-gray-400 text-sm p-2">Нет активных чатов</p>
          ) : (
            chats.map(partner => (
              <div 
                key={partner}
                onClick={() => openChat(partner)}
                className={`p-3 cursor-pointer rounded mb-1 ${activeChat === partner ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
              >
                <div className="font-medium">{partner}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {activeChat ? (
          <>
            <div className="p-4 border-b bg-white shadow-sm font-bold">
              Чат с {activeChat}
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              {messages.map((msg) => {
                const isMe = msg.username === user.username;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] p-3 rounded-lg ${isMe ? 'bg-blue-500 text-white' : 'bg-white border'}`}>
                      {!isMe && <div className="text-xs font-bold text-gray-500 mb-1">{msg.username}</div>}
                      <div className="text-sm">{msg.text}</div>
                      {msg.fileUrl && (
                        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="block mt-2 text-xs underline">
                          📎 {msg.fileName || 'Файл'}
                        </a>
                      )}
                      <div className={`text-[10px] mt-1 text-right ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Написать сообщение..."
                  className="flex-1 p-2 border rounded focus:outline-none focus:border-blue-500"
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="p-2 text-gray-500 hover:text-blue-500"
                >
                  {uploading ? '⏳' : '📎'}
                </button>
                <button 
                  onClick={handleSend}
                  disabled={!inputText.trim()}
                  className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
                >
                  ➤
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Выберите чат слева
          </div>
        )}
      </div>
    </div>
  );
}

export default App;