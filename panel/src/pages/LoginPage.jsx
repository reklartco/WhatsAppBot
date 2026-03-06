import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login, error } = useAuth();
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!secret.trim()) return;
    setLoading(true);
    await login(secret.trim());
    setLoading(false);
  };

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={handleSubmit}>
        <h1>1Etiket</h1>
        <p>Mesajlaşma Paneli</p>
        <input
          type="password"
          placeholder="Admin anahtarını girin..."
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoFocus
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Kontrol ediliyor...' : 'Giriş Yap'}
        </button>
        {error && <div className="login-error">{error}</div>}
      </form>
    </div>
  );
}
