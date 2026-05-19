/** Centralized TanStack Query key factory. */
export const queryKeys = {
  patients: {
    all: (tenantId: string) => ['patients', tenantId] as const,
    list: (tenantId: string, params?: Record<string, unknown>) => ['patients', tenantId, 'list', params] as const,
    detail: (tenantId: string, id: string) => ['patients', tenantId, id] as const,
    filter: (tenantId: string, filterHash: string) => ['patients', tenantId, 'filter', filterHash] as const,
  },
  presets: {
    all: (tenantId: string, userId: string) => ['presets', tenantId, userId] as const,
    detail: (tenantId: string, userId: string, id: string) => ['presets', tenantId, userId, id] as const,
  },
  permissions: {
    config: (userId: string) => ['permissions', 'config', userId] as const,
  },
  sync: {
    status: (tenantId: string) => ['sync', 'status', tenantId] as const,
  },
} as const;
