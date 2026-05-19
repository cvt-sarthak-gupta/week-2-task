import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { PermissionSchema } from './schema';
import { DEFAULT_PERMISSION_SCHEMA } from './schema';
import { canWithFlag } from './engine';
import type { Capability } from './schema';

interface PermissionContextValue {
  readonly schema: PermissionSchema;
  readonly can: (cap: Capability) => boolean;
}

const PermissionContext = createContext<PermissionContextValue>({
  schema: DEFAULT_PERMISSION_SCHEMA,
  can: () => false,
});

export function PermissionProvider({ schema, children }: { schema: PermissionSchema; children: ReactNode }) {
  const value = useMemo<PermissionContextValue>(
    () => ({ schema, can: (cap) => canWithFlag(schema, cap) }),
    [schema],
  );
  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions(): PermissionContextValue {
  return useContext(PermissionContext);
}
