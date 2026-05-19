import { getAccessToken, setAccessToken, clearAccessToken, isTokenExpired } from './tokens';
import type { Capability } from '../permissions/schema';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class CapabilityDeniedError extends Error {
  constructor(public readonly capability: Capability) {
    super(`Client-side capability check failed: ${capability}`);
    this.name = 'CapabilityDeniedError';
  }
}

let refreshPromise: Promise<void> | null = null;

async function refreshToken(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!res.ok) {
      clearAccessToken();
      window.dispatchEvent(new CustomEvent('auth:expired'));
      throw new ApiError(res.status, 'Session expired');
    }
    const data = (await res.json()) as { accessToken: string };
    setAccessToken(data.accessToken);
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  skipRefresh = false,
): Promise<T> {
  let token = getAccessToken();

  if (token && isTokenExpired(token) && !skipRefresh) {
    await refreshToken();
    token = getAccessToken();
  }

  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  const res = await fetch(`/api${path}`, { ...options, headers, credentials: 'include' });

  if (res.status === 401 && !skipRefresh) {
    await refreshToken();
    return apiFetch(path, options, true);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, (body as { message?: string })?.message ?? res.statusText, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
