import { Modal, Typography, Space, Descriptions } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { QueueEntry } from '@/core/offline/queue/types';
import type { ConflictMeta } from '@/core/offline/queue/types';
import type { Patient } from '@/shared/types';

export interface SyncConflict {
  entry: QueueEntry;
  meta: ConflictMeta;
}

interface ConflictModalProps {
  conflicts: SyncConflict[];
  onResolve: (entry: QueueEntry, resolution: 'keep_mine' | 'use_server') => void;
  onDismiss: () => void;
}

function renderPatient(payload: unknown): React.ReactNode {
  if (!payload || typeof payload !== 'object') return <em>—</em>;
  const p = payload as Partial<Patient>;
  return (
    <Descriptions size="small" column={1} bordered>
      {p.status && <Descriptions.Item label="Status">{p.status}</Descriptions.Item>}
      {p.notes && <Descriptions.Item label="Notes">{p.notes}</Descriptions.Item>}
      {p.version !== undefined && <Descriptions.Item label="Version">{p.version}</Descriptions.Item>}
    </Descriptions>
  );
}

export function ConflictModal({ conflicts, onResolve, onDismiss }: ConflictModalProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const current = conflicts[currentIdx];

  if (!current) return null;

  const isLast = currentIdx >= conflicts.length - 1;

  const handleResolution = (resolution: 'keep_mine' | 'use_server') => {
    onResolve(current.entry, resolution);
    if (isLast) {
      onDismiss();
    } else {
      setCurrentIdx((i) => i + 1);
    }
  };

  return (
    <Modal
      open={conflicts.length > 0}
      title={
        <Space>
          <WarningOutlined style={{ color: '#faad14' }} aria-hidden />
          <span>
            Sync conflict {conflicts.length > 1 ? `(${currentIdx + 1} of ${conflicts.length})` : ''}
          </span>
        </Space>
      }
      footer={null}
      closable={false}
      maskClosable={false}
      width={560}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Typography.Text>
          While you were offline, the server also updated{' '}
          <strong>patient {current.entry.entityId}</strong>.
          Choose which version to keep:
        </Typography.Text>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <Typography.Text strong>Your change</Typography.Text>
            <div style={{ marginTop: 8 }}>{renderPatient(current.entry.payload)}</div>
          </div>
          <div>
            <Typography.Text strong>Server version</Typography.Text>
            <div style={{ marginTop: 8 }}>{renderPatient(current.meta.serverPayload)}</div>
          </div>
        </div>

        <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
          <button
            type="button"
            style={{
              padding: '4px 16px',
              borderRadius: 6,
              border: '1px solid #d9d9d9',
              background: '#fff',
              cursor: 'pointer',
            }}
            onClick={() => handleResolution('use_server')}
            aria-label="Discard my change and use the server version"
          >
            Use server version
          </button>
          <button
            type="button"
            style={{
              padding: '4px 16px',
              borderRadius: 6,
              border: '1px solid #1677ff',
              background: '#1677ff',
              color: '#fff',
              cursor: 'pointer',
            }}
            onClick={() => handleResolution('keep_mine')}
            aria-label="Keep my offline change"
          >
            Keep mine
          </button>
        </Space>
      </Space>
    </Modal>
  );
}

// useState needs to be imported
import { useState } from 'react';
