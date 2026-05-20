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

  // Clears client-side session immediately without any network calls.
  // Used by the auth:expired handler so we don't trigger another refresh cycle.
  const clearSession = useCallback(() => {
    clearAccessToken();
    setUser(null);
  }, []);

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
    clearSession();
  }, [clearSession]);

  // When the refresh token is dead the server session is gone — clear state
  // immediately without making more API calls (which would loop back here).
  useEffect(() => {
    window.addEventListener('auth:expired', clearSession);
    return () => window.removeEventListener('auth:expired', clearSession);
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: user !== null, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
