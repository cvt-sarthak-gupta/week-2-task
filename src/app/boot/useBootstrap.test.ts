import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PermissionSchema } from '@/core/permissions/schema';
import { DEFAULT_PERMISSION_SCHEMA } from '@/core/permissions/schema';
import { ApiError } from '@/core/api/client';

vi.mock('@/core/api/client', () => ({
  apiFetch: vi.fn(),
  setActivePermissionSchema: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public readonly status: number, message: string) { super(message); this.name = 'ApiError'; }
  },
  CapabilityDeniedError: class CapabilityDeniedError extends Error {},
}));

import { apiFetch } from '@/core/api/client';
import { useBootstrap } from './useBootstrap';

const mockApiFetch = vi.mocked(apiFetch);

const CONFIG_CACHE_KEY = 'hcd_permission_config';
const CONFIG_VERSION_KEY = 'hcd_permission_config_version';

const MOCK_CONFIG: PermissionSchema = {
  capabilities: ['viewPatients', 'editPatientStatus', 'exportPatients'],
  featureFlags: {
    exportFeature: true,
    advancedFilters: true,
    presetSharing: false,
  },
  layout: {
    visibleColumns: [],
    sideWidgets: [],
    actionBar: ['editStatus'],
  },
};

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue({ config: MOCK_CONFIG, version: 'v1' });
});

describe('useBootstrap', () => {
  it('does not fetch when userId is null', () => {
    const client = makeQueryClient();
    const { result } = renderHook(() => useBootstrap(null), { wrapper: makeWrapper(client) });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('returns placeholder data while disabled (userId null)', () => {
    const client = makeQueryClient();
    const { result } = renderHook(() => useBootstrap(null), { wrapper: makeWrapper(client) });
    expect(result.current.data?.capabilities).toContain('viewPatients');
  });

  it('fetches config when userId is provided', async () => {
    const client = makeQueryClient();
    const { result } = renderHook(() => useBootstrap('u1'), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch).toHaveBeenCalledWith('/me/config');
  });

  it('returns config shape from the server response', async () => {
    const client = makeQueryClient();
    const { result } = renderHook(() => useBootstrap('u1'), { wrapper: makeWrapper(client) });
    // Wait for real data (not just placeholder) to arrive
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.isPlaceholderData).toBe(false);
    });
    expect(result.current.data?.capabilities).toEqual(MOCK_CONFIG.capabilities);
    expect(result.current.data?.featureFlags).toEqual(MOCK_CONFIG.featureFlags);
    expect(result.current.data?.layout).toEqual(MOCK_CONFIG.layout);
  });

  it('saves fetched config to localStorage', async () => {
    const client = makeQueryClient();
    const { result } = renderHook(() => useBootstrap('u1'), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cached = localStorage.getItem(CONFIG_CACHE_KEY);
    expect(cached).not.toBeNull();
    const parsed = JSON.parse(cached!) as PermissionSchema;
    expect(parsed.capabilities).toEqual(MOCK_CONFIG.capabilities);
  });

  it('saves the config version to localStorage', async () => {
    mockApiFetch.mockResolvedValue({ config: MOCK_CONFIG, version: 'v42' });
    const client = makeQueryClient();
    const { result } = renderHook(() => useBootstrap('u1'), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(localStorage.getItem(CONFIG_VERSION_KEY)).toBe('v42');
  });

  it('uses localStorage placeholder data immediately on mount', () => {
    const cachedConfig: PermissionSchema = {
      ...MOCK_CONFIG,
      capabilities: ['viewPatients'],
    };
    localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(cachedConfig));
    // Block the fetch so only placeholder is visible
    mockApiFetch.mockReturnValue(new Promise(() => { /* never resolves */ }));

    const client = makeQueryClient();
    const { result } = renderHook(() => useBootstrap('u1'), { wrapper: makeWrapper(client) });
    expect(result.current.data?.capabilities).toContain('viewPatients');
  });

  it('falls back to DEFAULT_PERMISSION_SCHEMA when localStorage is empty', () => {
    mockApiFetch.mockReturnValue(new Promise(() => { /* never resolves */ }));
    const client = makeQueryClient();
    const { result } = renderHook(() => useBootstrap('u1'), { wrapper: makeWrapper(client) });
    expect(result.current.data).toEqual(DEFAULT_PERMISSION_SCHEMA);
  });

  it('ignores corrupted localStorage cache (falls back to default)', () => {
    localStorage.setItem(CONFIG_CACHE_KEY, 'not-valid-json{{{');
    mockApiFetch.mockReturnValue(new Promise(() => { /* never resolves */ }));
    const client = makeQueryClient();
    const { result } = renderHook(() => useBootstrap('u1'), { wrapper: makeWrapper(client) });
    expect(result.current.data).toEqual(DEFAULT_PERMISSION_SCHEMA);
  });

  it('ignores a cached object that lacks the required capabilities field', () => {
    localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({ notASchema: true }));
    mockApiFetch.mockReturnValue(new Promise(() => { /* never resolves */ }));
    const client = makeQueryClient();
    const { result } = renderHook(() => useBootstrap('u1'), { wrapper: makeWrapper(client) });
    expect(result.current.data).toEqual(DEFAULT_PERMISSION_SCHEMA);
  });

  it('overwrites stale localStorage cache after a successful fetch', async () => {
    const stale: PermissionSchema = { ...MOCK_CONFIG, capabilities: ['viewPatients'] };
    localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(stale));
    const client = makeQueryClient();
    const { result } = renderHook(() => useBootstrap('u1'), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cached = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY)!) as PermissionSchema;
    expect(cached.capabilities).toEqual(MOCK_CONFIG.capabilities);
  });

  it('is in error state when apiFetch rejects (after retries)', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    vi.useFakeTimers();
    const client = makeQueryClient();
    const { result } = renderHook(() => useBootstrap('u1'), { wrapper: makeWrapper(client) });
    // Advance through retry delays (hook uses retry: 2 = 3 total attempts)
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('re-runs the query with a new cache key when userId changes', async () => {
    const client = makeQueryClient();
    const { rerender } = renderHook(
      ({ userId }: { userId: string }) => useBootstrap(userId),
      { wrapper: makeWrapper(client), initialProps: { userId: 'u1' } },
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));

    rerender({ userId: 'u2' });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
  });
});
