import { useState } from 'react';
import { Modal, Space, Typography, Button, Input, Descriptions, Tag } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { FilterPreset } from '@/shared/types';

export type ConflictResolution =
  | { action: 'force_overwrite' }
  | { action: 'accept_server' }
  | { action: 'save_as_new'; name: string };

export interface PresetConflict {
  /** The update the user was trying to save */
  localPayload: Pick<FilterPreset, 'name' | 'filterAst' | 'isShared'>;
  /** The current server version that blocked the update */
  serverPayload: FilterPreset;
  presetId: string;
}

interface PresetConflictModalProps {
  conflict: PresetConflict | null;
  onResolve: (resolution: ConflictResolution) => void;
  onDismiss: () => void;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function renderPresetSummary(preset: Pick<FilterPreset, 'name' | 'filterAst' | 'isShared'>): React.ReactNode {
  return (
    <Descriptions size="small" column={1} bordered>
      <Descriptions.Item label="Name">{preset.name}</Descriptions.Item>
      <Descriptions.Item label="Shared">
        {preset.isShared ? <Tag color="blue">Shared</Tag> : <Tag>Private</Tag>}
      </Descriptions.Item>
      <Descriptions.Item label="Filter">
        <Typography.Text
          code
          copyable
          style={{ fontSize: 11, wordBreak: 'break-all', maxWidth: 220, display: 'inline-block' }}
        >
          {preset.filterAst}
        </Typography.Text>
      </Descriptions.Item>
    </Descriptions>
  );
}

export function PresetConflictModal({ conflict, onResolve, onDismiss }: PresetConflictModalProps) {
  const [newName, setNewName] = useState('');
  const [view, setView] = useState<'choose' | 'rename'>('choose');

  if (!conflict) return null;

  const handleForceOverwrite = () => {
    onResolve({ action: 'force_overwrite' });
  };

  const handleAcceptServer = () => {
    onResolve({ action: 'accept_server' });
  };

  const handleSaveAsNew = () => {
    if (!newName.trim()) return;
    onResolve({ action: 'save_as_new', name: newName.trim() });
  };

  const handleClose = () => {
    setView('choose');
    setNewName('');
    onDismiss();
  };

  if (view === 'rename') {
    return (
      <Modal
        open
        title={
          <Space>
            <WarningOutlined style={{ color: '#faad14' }} aria-hidden />
            <span>Save as new preset</span>
          </Space>
        }
        onCancel={() => setView('choose')}
        footer={null}
        width={440}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Typography.Text type="secondary">
            Enter a new name to save your changes as a separate preset without overwriting the server version.
          </Typography.Text>
          <div>
            <label htmlFor="conflict-new-name" style={{ display: 'block', marginBottom: 4 }}>
              New preset name
            </label>
            <Input
              id="conflict-new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onPressEnter={handleSaveAsNew}
              placeholder={`${conflict.localPayload.name} (my version)`}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setView('choose')}>Back</Button>
            <Button type="primary" disabled={!newName.trim()} onClick={handleSaveAsNew}>
              Save as new
            </Button>
          </div>
        </Space>
      </Modal>
    );
  }

  return (
    <Modal
      open
      title={
        <Space>
          <WarningOutlined style={{ color: '#faad14' }} aria-hidden />
          <span>Preset edited by another session</span>
        </Space>
      }
      onCancel={handleClose}
      footer={null}
      closable
      maskClosable={false}
      width={620}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Typography.Text>
          <strong>{conflict.serverPayload.name}</strong> was modified by another session while you were editing it.
          The server version is at{' '}
          <Typography.Text type="secondary">
            v{conflict.serverPayload.version} (saved {formatTimestamp(conflict.serverPayload.updatedAt)})
          </Typography.Text>.
          Choose how to resolve the conflict:
        </Typography.Text>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <Typography.Text strong>Your changes</Typography.Text>
            <div style={{ marginTop: 8 }}>
              {renderPresetSummary(conflict.localPayload)}
            </div>
          </div>
          <div>
            <Typography.Text strong>Server version (v{conflict.serverPayload.version})</Typography.Text>
            <div style={{ marginTop: 8 }}>
              {renderPresetSummary(conflict.serverPayload)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderTop: '1px solid #f0f0f0' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Choose a resolution:</Typography.Text>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              onClick={handleForceOverwrite}
              danger
              aria-label="Overwrite the server version with my changes"
            >
              Overwrite server version
            </Button>
            <Button
              onClick={handleAcceptServer}
              aria-label="Discard my changes and keep the server version"
            >
              Discard my changes
            </Button>
            <Button
              type="primary"
              onClick={() => { setNewName(`${conflict.localPayload.name} (copy)`); setView('rename'); }}
              aria-label="Save my changes as a new preset with a different name"
            >
              Save as new preset
            </Button>
          </div>
        </div>
      </Space>
    </Modal>
  );
}
