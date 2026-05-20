import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { PermissionSchema } from './schema';
import { DEFAULT_PERMISSION_SCHEMA } from './schema';
import { canWithFlag } from './engine';
import type { Capability } from './schema';
import { setActivePermissionSchema } from '@/core/api/client';

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

  useEffect(() => {
    setActivePermissionSchema(schema);
    return () => { setActivePermissionSchema(null); };
  }, [schema]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions(): PermissionContextValue {
  return useContext(PermissionContext);
}
