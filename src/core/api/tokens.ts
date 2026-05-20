const ACCESS_TOKEN_KEY = 'hcd_access_token';

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

export interface JwtClaims {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
  capabilities: string[];
  exp: number;
  iat: number;
}

function isJwtClaims(v: unknown): v is JwtClaims {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj['sub'] === 'string' &&
    typeof obj['tenantId'] === 'string' &&
    typeof obj['email'] === 'string' &&
    typeof obj['role'] === 'string' &&
    typeof obj['exp'] === 'number'
  );
}

export function decodeJwt(token: string): JwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) throw new Error('Invalid JWT format');
  const raw = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as unknown;
  if (!isJwtClaims(raw)) throw new Error('JWT payload missing required claims');
  return raw;
}

export function isTokenExpired(token: string): boolean {
  try {
    const { exp } = decodeJwt(token);
    return Date.now() / 1000 >= exp - 30; // 30s grace period
  } catch {
    return true;
  }
}
