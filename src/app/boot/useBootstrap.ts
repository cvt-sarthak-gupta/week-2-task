import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/core/api/client';
import type { PermissionSchema } from '@/core/permissions/schema';
import { DEFAULT_PERMISSION_SCHEMA } from '@/core/permissions/schema';
import { queryKeys } from '@/core/api/queryKeys';

const CONFIG_CACHE_KEY = 'hcd_permission_config';
const CONFIG_VERSION_KEY = 'hcd_permission_config_version';

function isValidPermissionSchema(v: unknown): v is PermissionSchema {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (
    Array.isArray(s['capabilities']) &&
    typeof s['featureFlags'] === 'object' &&
    s['featureFlags'] !== null &&
    typeof s['layout'] === 'object' &&
    s['layout'] !== null
  );
}

function loadCachedConfig(): PermissionSchema | null {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidPermissionSchema(parsed) ? parsed : null;
  } catch (err) {
    console.warn('[useBootstrap] Failed to parse cached permission config:', err);
    return null;
  }
}

function saveConfigCache(config: PermissionSchema, version: string): void {
  try {
    localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config));
    localStorage.setItem(CONFIG_VERSION_KEY, version);
  } catch (err) {
    console.warn('[useBootstrap] failed to save permission config to localStorage:', err);
  }
}

export function useBootstrap(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.permissions.config(userId ?? ''),
    queryFn: async (): Promise<PermissionSchema> => {
      try {
        const res = await apiFetch<{ config: PermissionSchema; version: string }>('/me/config');
        saveConfigCache(res.config, res.version);
        return res.config;
      } catch (err) {
        console.error('[useBootstrap] Failed to fetch permission config from /me/config:', err);
        throw err;
      }
    },
    enabled: userId !== null,
    staleTime: 5 * 60 * 1000,
    placeholderData: () => loadCachedConfig() ?? DEFAULT_PERMISSION_SCHEMA,
    refetchOnMount: true,
    retry: 2,
  });
}
