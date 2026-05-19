import { usePermissions } from './PermissionProvider';
import type { Capability } from './schema';

export function useCan(capability: Capability): boolean {
  const { can } = usePermissions();
  return can(capability);
}
