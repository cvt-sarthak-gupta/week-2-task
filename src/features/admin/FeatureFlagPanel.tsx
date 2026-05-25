import { Drawer, Switch, Typography, Space, Divider, Spin, Tag } from 'antd';
import { ControlOutlined } from '@ant-design/icons';
import { usePermissions } from '@/core/permissions/PermissionProvider';
import { useUpdateFeatureFlags } from './useFeatureFlags';
import type { FeatureFlagKey } from '@/core/permissions/schema';

interface FlagMeta {
  key: FeatureFlagKey;
  label: string;
  description: string;
  requiresReload?: boolean;
}

const FLAG_META: FlagMeta[] = [
  {
    key: 'exportFeature',
    label: 'Patient Export',
    description: 'Allow coordinators and admins to export patient records to Excel.',
  },
  {
    key: 'advancedFilters',
    label: 'Advanced Filter Builder',
    description: 'Enable the multi-field AND/OR filter expression builder.',
  },
  {
    key: 'presetSharing',
    label: 'Preset Sharing',
    description: 'Allow users to share saved filter presets with their team.',
  },
];

interface FeatureFlagPanelProps {
  userId: string;
  open: boolean;
  onClose: () => void;
}

export function FeatureFlagPanel({ userId, open, onClose }: FeatureFlagPanelProps) {
  const { schema } = usePermissions();
  const { mutate, isPending } = useUpdateFeatureFlags(userId);

  return (
    <Drawer
      title={
        <Space>
          <ControlOutlined aria-hidden />
          <span>Feature Flags</span>
        </Space>
      }
      placement="right"
      width={420}
      open={open}
      onClose={onClose}
      aria-label="Manage runtime feature flags"
    >
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
        Toggle features on or off for <strong>all users in this tenant</strong>. Changes take effect
        immediately — no redeployment required.
      </Typography.Text>
      <Typography.Text type="warning" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
        Note: changes are in-memory and reset when the server restarts.
      </Typography.Text>

      <Divider style={{ margin: '0 0 20px' }} />

      <Spin spinning={isPending}>
        <Space direction="vertical" style={{ width: '100%' }} size={20}>
          {FLAG_META.map(({ key, label, description, requiresReload }) => (
            <div
              key={key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 16,
                padding: '8px 0',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <div style={{ flex: 1 }}>
                <Space size={6} style={{ marginBottom: 2 }}>
                  <Typography.Text strong>{label}</Typography.Text>
                  {requiresReload && (
                    <Tag color="orange" style={{ margin: 0, fontSize: 10 }}>
                      Reload to apply
                    </Tag>
                  )}
                </Space>
                <Typography.Text
                  type="secondary"
                  style={{ fontSize: 12, display: 'block' }}
                >
                  {description}
                </Typography.Text>
              </div>
              <Switch
                checked={schema.featureFlags[key]}
                disabled={isPending}
                onChange={(val) => mutate({ [key]: val })}
                aria-label={`Toggle ${label}`}
              />
            </div>
          ))}
        </Space>
      </Spin>
    </Drawer>
  );
}
