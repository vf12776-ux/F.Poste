import { useState, useEffect } from 'react';
import { getMe, getToken, clearToken } from './api';
import LoginScreen from './components/LoginScreen';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token) {
      getMe()
        .then(() => setIsLoggedIn(true))
        .catch(() => clearToken())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Загрузка...</div>;
  }

  if (!isLoggedIn) {
    return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <div>
      <h1>F.Poste</h1>
      <p>Чат работает. Здесь будет основной интерфейс.</p>
      <button onClick={() => { clearToken(); setIsLoggedIn(false); }}>Выйти</button>
    </div>
  );
}

export default App;
