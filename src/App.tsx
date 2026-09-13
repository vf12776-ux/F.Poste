import React, { useState, useEffect } from 'react';
import Chat from './Chat';
import LoginScreen from './components/LoginScreen';
import { getMe } from './api';

const App: React.FC = () => {
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('fposte_token');
    if (!token) {
      setLoading(false);
      return;
    }
    
    getMe()
      .then((user) => {
        setUsername(user.username);
        setLoading(false);
      })
      .catch(() => {
        localStorage.removeItem('fposte_token');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Загрузка...</div>;
  }

  if (!username) {
    return <LoginScreen onLogin={() => window.location.reload()} />;
  }

  return <Chat username={username} />;
};

export default App;