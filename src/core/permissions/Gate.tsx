import type { ReactNode } from 'react';
import { useCan } from './useCan';
import type { Capability } from './schema';

interface GateProps {
  cap: Capability;
  children: ReactNode;
  fallback?: ReactNode;
}

export function Gate({ cap, children, fallback = null }: GateProps): ReactNode {
  const allowed = useCan(cap);
  return allowed ? children : fallback;
}
