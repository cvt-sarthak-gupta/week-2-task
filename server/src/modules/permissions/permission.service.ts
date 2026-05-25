import { getFlagsForTenant, setFlagsForTenant, type FeatureFlags } from '../../infrastructure/featureFlagStore';
import { getColumnsForRole, setColumnsForRole, type ColumnConfig } from '../../infrastructure/columnVisibilityStore';
import type { PermissionConfig, LayoutConfig } from './permission.entity';
import type { UpdateFeatureFlagsDto, UpdateColumnVisibilityDto } from './permission.types';
import { PermissionHelper } from './permission.helper';

export class PermissionService {
  getConfig(tenantId: string, userId: string, role: string, capabilities: string[]): PermissionConfig {
    const featureFlags = getFlagsForTenant(tenantId);
    const layout: LayoutConfig = {
      visibleColumns: getColumnsForRole(tenantId, role),
      sideWidgets: [],
      actionBar: PermissionHelper.buildActionBar(capabilities),
    };
    return { capabilities, featureFlags, layout, userId };
  }

  updateFlags(tenantId: string, dto: UpdateFeatureFlagsDto): FeatureFlags {
    return setFlagsForTenant(tenantId, dto);
  }

  updateColumns(tenantId: string, dto: UpdateColumnVisibilityDto): ColumnConfig[] {
    return setColumnsForRole(tenantId, dto.role, dto.columns);
  }
}
