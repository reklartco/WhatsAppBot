import { createContext, useContext, useState, useCallback } from 'react';
import { setAdminSecret, checkAuth } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const saved = sessionStorage.getItem('admin_secret');
    if (saved) {
      setAdminSecret(saved);
      return true;
    }
    return false;
  });
  const [error, setError] = useState('');

  const login = useCallback(async (secret) => {
    setError('');
    setAdminSecret(secret);
    try {
      await checkAuth();
      sessionStorage.setItem('admin_secret', secret);
      setIsAuthenticated(true);
      return true;
    } catch (e) {
      setAdminSecret('');
      setError('Geçersiz admin anahtarı');
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('admin_secret');
    setAdminSecret('');
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
