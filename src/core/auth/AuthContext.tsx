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
  readonly isBootstrapping: boolean; // true while we're attempting a silent refresh on mount
  login: (creds: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isBootstrapping: true,
  login: async () => { throw new Error('AuthProvider not mounted'); },
  logout: async () => { throw new Error('AuthProvider not mounted'); },
});

function userFromToken(token: string): User | null {
  if (!token || isTokenExpired(token)) return null;
  try {
    const claims = decodeJwt(token);
    return {
      id: claims.sub,
      tenantId: claims.tenantId,
      role: claims.role as User['role'],
      email: claims.email,
      displayName: claims.email.split('@')[0] ?? claims.email,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // isBootstrapping stays true until the silent refresh attempt settles (success or failure).
  // This prevents a flash of the login page on authenticated page loads.
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const clearSession = useCallback(() => {
    clearAccessToken();
    setUser(null);
  }, []);

  // On mount: silently attempt to get a new access token using the httpOnly refresh cookie.
  // If it succeeds, the user is restored without a login screen.
  // If it fails (no cookie, expired, or network error), we land on the login page.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // If a valid in-memory token already exists (impossible on cold load, but possible
      // in unit tests or hot-reload scenarios), skip the network round-trip.
      const existing = getAccessToken();
      if (existing && !isTokenExpired(existing)) {
        const restored = userFromToken(existing);
        if (!cancelled) { setUser(restored); setIsBootstrapping(false); }
        return;
      }

      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (!cancelled) {
          if (res.ok) {
            const data = (await res.json()) as { accessToken: string };
            setAccessToken(data.accessToken);
            setUser(userFromToken(data.accessToken));
          }
          // On failure (401, network error) we simply stay logged out — no error shown
        }
      } catch {
        // Network unavailable — stay logged out
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    })();
    return () => { cancelled = true; };
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

  useEffect(() => {
    window.addEventListener('auth:expired', clearSession);
    return () => window.removeEventListener('auth:expired', clearSession);
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: user !== null, isBootstrapping, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
