import { useState } from 'react';
import { Drawer, Switch, Typography, Space, Divider, Spin, Tag, Select } from 'antd';
import { TableOutlined } from '@ant-design/icons';
import { usePermissions } from '@/core/permissions/PermissionProvider';
import { useUpdateColumnVisibility } from './useColumnVisibility';

interface ColumnMeta {
  field: string;
  label: string;
  alwaysOn?: boolean;
}

// Mirrors ALL_COLUMNS in server/src/infrastructure/columnVisibilityStore.ts.
// alwaysOn columns are required identifiers that cannot be hidden for any role.
const COLUMNS: ColumnMeta[] = [
  { field: 'mrn',        label: 'MRN',          alwaysOn: true },
  { field: 'lastName',   label: 'Last Name' },
  { field: 'firstName',  label: 'First Name' },
  { field: 'status',     label: 'Status',        alwaysOn: true },
  { field: 'ward',       label: 'Ward' },
  { field: 'heartRate',  label: 'HR (bpm)' },
  { field: 'bp',         label: 'BP (mmHg)' },
  { field: 'temp',       label: 'Temp (°C)' },
  { field: 'o2sat',      label: 'SpO2 (%)' },
  { field: 'dob',        label: 'DOB' },
  { field: 'age',        label: 'Age' },
  { field: 'admittedAt', label: 'Admitted' },
  { field: 'updatedAt',  label: 'Last Updated' },
];

const ROLES = [
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'admin',       label: 'Admin' },
  { value: 'readonly',    label: 'Read-only' },
];

// Per-role default visibility, mirroring ROLE_DEFAULTS in columnVisibilityStore.ts.
// Used to render the current state before the server schema refreshes.
const READONLY_DEFAULT_FIELDS = new Set(['mrn', 'lastName', 'firstName', 'status', 'ward']);

function defaultVisibleForRole(role: string, field: string): boolean {
  if (role === 'readonly') return READONLY_DEFAULT_FIELDS.has(field);
  return true;
}

interface ColumnVisibilityPanelProps {
  userId: string;
  open: boolean;
  onClose: () => void;
}

export function ColumnVisibilityPanel({ userId, open, onClose }: ColumnVisibilityPanelProps) {
  const { schema } = usePermissions();
  const { mutate, isPending } = useUpdateColumnVisibility(userId);
  const [selectedRole, setSelectedRole] = useState<string>('coordinator');

  // The schema reflects the current user's own role config.
  // For the admin panel we need to show configs for other roles too,
  // so after a successful save the server sends back the updated list
  // and we show an optimistic view using local state until the query refetches.
  const [optimisticOverrides, setOptimisticOverrides] = useState<
    Map<string, Record<string, boolean>>
  >(new Map());

  const visibilityMapFromSchema = new Map(
    schema.layout.visibleColumns.map((c) => [c.field, c.visible]),
  );

  const isVisible = (field: string): boolean => {
    const roleOverrides = optimisticOverrides.get(selectedRole);
    if (roleOverrides && roleOverrides[field] !== undefined) {
      return roleOverrides[field]!;
    }
    // Fall back to schema (only accurate for the logged-in user's own role)
    if (visibilityMapFromSchema.has(field)) return visibilityMapFromSchema.get(field)!;
    return defaultVisibleForRole(selectedRole, field);
  };

  const handleToggle = (field: string, value: boolean) => {
    // Apply optimistic update immediately so the UI feels instant
    setOptimisticOverrides((prev) => {
      const next = new Map(prev);
      next.set(selectedRole, { ...(next.get(selectedRole) ?? {}), [field]: value });
      return next;
    });
    mutate({ role: selectedRole, columns: { [field]: value } });
  };

  return (
    <Drawer
      title={
        <Space>
          <TableOutlined aria-hidden />
          <span>Manage Columns</span>
        </Space>
      }
      placement="right"
      width={380}
      open={open}
      onClose={onClose}
      aria-label="Manage visible table columns per role"
    >
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Configure which columns are visible for each user role. Changes apply to all users with that role in this tenant.
      </Typography.Text>

      <div style={{ marginBottom: 16 }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
          Configure for role
        </Typography.Text>
        <Select
          value={selectedRole}
          onChange={setSelectedRole}
          options={ROLES}
          style={{ width: '100%' }}
          aria-label="Select role to configure"
        />
      </div>

      <Divider style={{ margin: '0 0 16px' }} />

      <Spin spinning={isPending}>
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {COLUMNS.map(({ field, label, alwaysOn }) => (
            <div
              key={field}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
            >
              <Space size={6}>
                <Typography.Text>{label}</Typography.Text>
                {alwaysOn && (
                  <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>Required</Tag>
                )}
              </Space>
              <Switch
                checked={alwaysOn ? true : isVisible(field)}
                disabled={alwaysOn || isPending}
                onChange={(val) => handleToggle(field, val)}
                aria-label={alwaysOn ? `${label} — always visible` : `Toggle ${label} for ${selectedRole} role`}
              />
            </div>
          ))}
        </Space>
      </Spin>
    </Drawer>
  );
}
