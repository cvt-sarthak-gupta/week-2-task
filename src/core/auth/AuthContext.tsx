import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { User } from '@/shared/types';
import { setAccessToken, clearAccessToken, decodeJwt, getAccessToken, isTokenExpired } from '../api/tokens';
import { apiFetch } from '../api/client';

interface LoginCredentials {
  email: string;
  password: string;
}

interface AuthContextValue {
  readonly user: User | null;
  readonly isAuthenticated: boolean;
  login: (creds: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  login: async () => { throw new Error('AuthProvider not mounted'); },
  logout: async () => { throw new Error('AuthProvider not mounted'); },
});

function bootstrapUserFromToken(): User | null {
  const token = getAccessToken();
  if (!token || isTokenExpired(token)) return null;
  try {
    const claims = decodeJwt(token);
    return { id: claims.sub, tenantId: claims.tenantId, role: claims.role as User['role'], email: claims.email, displayName: claims.email.split('@')[0] ?? claims.email };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(bootstrapUserFromToken);

  const login = useCallback(async (creds: LoginCredentials) => {
    const res = await apiFetch<{ accessToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(creds),
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => null);
    clearAccessToken();
    setUser(null);
  }, []);

  // Force logout when the refresh token call fails so the user re-authenticates with a fresh token
  useEffect(() => {
    const handleExpired = () => void logout();
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: user !== null, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
