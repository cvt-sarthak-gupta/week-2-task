import type { ReactNode } from 'react';
import { useCan } from './useCan';
import type { Capability } from './schema';

interface GateProps {
  cap: Capability;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Renders children ONLY when the current user has the capability.
 * Does NOT render the child tree for unauthorized users — not just CSS-hidden.
 */
export function Gate({ cap, children, fallback = null }: GateProps): ReactNode {
  const allowed = useCan(cap);
  return allowed ? children : fallback;
}
