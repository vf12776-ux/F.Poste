import { useState } from 'react';
import { login, setToken } from '../api';

interface Props {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (username.length < 5) {
      setError('Минимум 5 символов');
      return;
    }
    
    setLoading(true);
    
    try {
      const data = await login(username.toLowerCase(), username);
      setToken(data.token);
      onLogin();
    } catch (err) {
      setError('Ошибка входа. Попробуй другой ник.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px',
      background: '#f5f5f5'
    }}>
      <h1 style={{ marginBottom: '30px' }}>F.Poste</h1>
      <form onSubmit={handleSubmit} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '15px',
        width: '100%',
        maxWidth: '300px'
      }}>
        <input
          type="text"
          placeholder="Введите ник (латиница, мин. 5 символов)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
          style={{
            padding: '12px',
            fontSize: '16px',
            border: '1px solid #ddd',
            borderRadius: '8px'
          }}
        />
        {error && <p style={{ color: 'red', margin: 0 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '12px',
            fontSize: '16px',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Вход...' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
