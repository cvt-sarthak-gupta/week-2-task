import { memo, useState } from 'react';
import { Button, Dropdown, Input, Modal, Space, Switch, Tooltip, Typography, Tag, Divider, Alert } from 'antd';
import {
  BookOutlined,
  DeleteOutlined,
  PlusOutlined,
  ShareAltOutlined,
  EditOutlined,
  SyncOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import type { FilterPreset } from '@/shared/types';
import { serialize, deserialize } from '@/features/filters/ast/serialize';
import { deserializeUrl } from '@/features/filters/ast/url-format';
import type { FilterNode } from '@/features/filters/ast/types';
import { buildFilterAst } from '@/core/workers/useFilterWorker';
import { FilterBuilder } from '@/features/filters/FilterBuilder';
import type { PatientFilters } from '../patientFilters';

interface PresetPanelProps {
  tenantId: string;
  userId: string;
  presets: FilterPreset[];
  currentFilters: PatientFilters;
  onLoadPreset: (filterAst: string) => void;
  onSavePreset: (name: string, isShared: boolean) => void;
  onEditPreset: (
    id: string,
    patch: { name?: string; filterAst?: string; isShared?: boolean; version: number },
  ) => void;
  onDeletePreset: (id: string) => void;
  canShare: boolean;
}

interface UpdateFilterConfirmProps {
  preset: FilterPreset | null;
  newFilterAst: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const UpdateFilterConfirm = memo(function UpdateFilterConfirm({ preset, newFilterAst, onConfirm, onCancel }: UpdateFilterConfirmProps) {
  if (!preset || !newFilterAst) return null;
  return (
    <Modal
      title={
        <Space>
          <SyncOutlined style={{ color: '#1677ff' }} />
          <span>Update preset filter</span>
        </Space>
      }
      open={!!preset}
      onOk={onConfirm}
      onCancel={onCancel}
      okText="Update filter"
      okType="primary"
      destroyOnClose
      width={480}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Typography.Text>
          Replace the stored filter in <Typography.Text strong>"{preset.name}"</Typography.Text> with
          the filter currently active in the table?
        </Typography.Text>
        <div style={{ background: '#f5f5f5', borderRadius: 6, padding: '8px 12px' }}>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
            New filter
          </Typography.Text>
          <Typography.Text
            code
            copyable={{ text: newFilterAst }}
            style={{ fontSize: 11, wordBreak: 'break-all' }}
          >
            {newFilterAst}
          </Typography.Text>
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          This cannot be undone. If the preset has been edited by another session you will be
          prompted to resolve the conflict before the change is saved.
        </Typography.Text>
      </Space>
    </Modal>
  );
});

interface SaveModalProps {
  open: boolean;
  canShare: boolean;
  onOk: (name: string, isShared: boolean) => void;
  onCancel: () => void;
}

const SaveModal = memo(function SaveModal({ open, canShare, onOk, onCancel }: SaveModalProps) {
  const [name, setName] = useState('');
  const [isShared, setIsShared] = useState(false);

  const handleOk = () => {
    if (!name.trim()) return;
    onOk(name.trim(), isShared);
    setName('');
    setIsShared(false);
  };

  const handleCancel = () => {
    setName('');
    setIsShared(false);
    onCancel();
  };

  return (
    <Modal
      title="Save filter preset"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="Save"
      okButtonProps={{ disabled: !name.trim() }}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <label htmlFor="preset-save-name" style={{ display: 'block', marginBottom: 4 }}>
            Preset name
          </label>
          <Input
            id="preset-save-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={handleOk}
            placeholder="e.g. Critical ICU patients"
            autoFocus
          />
        </div>
        {canShare && (
          <Space>
            <Switch
              id="preset-save-share"
              checked={isShared}
              onChange={setIsShared}
              aria-label="Share this preset with your team"
            />
            <label htmlFor="preset-save-share">Share with team</label>
          </Space>
        )}
      </Space>
    </Modal>
  );
});

interface EditModalState {
  preset: FilterPreset;
}

interface EditModalProps {
  state: EditModalState | null;
  canShare: boolean;
  currentFilterAst: string | null;
  onOk: (
    id: string,
    patch: { name?: string; filterAst?: string; isShared?: boolean; version: number },
  ) => void;
  onCancel: () => void;
}

function parseFilterNode(ast: string | null | undefined): FilterNode | null {
  if (!ast) return null;
  try { return deserialize(ast); } catch { return null; }
}

function EditModal({ state, canShare, currentFilterAst, onOk, onCancel }: EditModalProps) {
  const preset = state?.preset;

  const [name, setName] = useState(preset?.name ?? '');
  const [isShared, setIsShared] = useState(preset?.isShared ?? false);
  const [filterDraft, setFilterDraft] = useState<FilterNode | null>(
    parseFilterNode(preset?.filterAst),
  );

  const presetId = preset?.id;
  const [lastId, setLastId] = useState(presetId);
  if (presetId !== lastId) {
    setLastId(presetId);
    setName(preset?.name ?? '');
    setIsShared(preset?.isShared ?? false);
    setFilterDraft(parseFilterNode(preset?.filterAst));
  }

  if (!state || !preset) return null;

  const originalFilterAst = preset.filterAst;
  const draftFilterAst = filterDraft ? serialize(filterDraft) : null;

  const nameChanged     = name.trim() !== preset.name;
  const sharedChanged   = isShared !== preset.isShared;
  const filterChanged   = draftFilterAst !== originalFilterAst;
  const hasChanges      = nameChanged || sharedChanged || filterChanged;
  const hasValidFilter  = !!filterDraft;

  const handleOk = () => {
    if (!name.trim() || !hasValidFilter) return;
    const patch: { name?: string; filterAst?: string; isShared?: boolean; version: number } = {
      version: preset.version,
    };
    if (nameChanged)   patch.name      = name.trim();
    if (sharedChanged) patch.isShared  = isShared;
    if (filterChanged && draftFilterAst) patch.filterAst = draftFilterAst;
    onOk(preset.id, patch);
  };

  const handleUseCurrentFilter = () => {
    if (!currentFilterAst) return;
    setFilterDraft(parseFilterNode(currentFilterAst));
  };

  const hasCurrentFilter = !!currentFilterAst;
  const currentFilterDiffers = currentFilterAst && currentFilterAst !== draftFilterAst;

  return (
    <Modal
      title={
        <Space>
          <EditOutlined />
          <span>Edit preset — <Typography.Text strong>{preset.name}</Typography.Text></span>
        </Space>
      }
      open={!!state}
      onCancel={onCancel}
      width={660}
      destroyOnClose
      footer={
        <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            type="primary"
            disabled={!hasChanges || !name.trim() || !hasValidFilter}
            onClick={handleOk}
          >
            Save changes
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">

        <div>
          <label htmlFor="preset-edit-name" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
            Preset name
          </label>
          <Input
            id="preset-edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={handleOk}
            autoFocus
          />
        </div>

        {canShare && (
          <Space>
            <Switch
              id="preset-edit-share"
              checked={isShared}
              onChange={setIsShared}
              aria-label="Share this preset with your team"
            />
            <label htmlFor="preset-edit-share" style={{ cursor: 'pointer' }}>
              {isShared ? 'Shared with team' : 'Private — only visible to you'}
            </label>
          </Space>
        )}

        <Divider style={{ margin: '4px 0' }} />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Typography.Text strong>Filter conditions</Typography.Text>

            {hasCurrentFilter && (
              <Tooltip
                title={
                  currentFilterDiffers
                    ? 'Replace the preset filter with the filter currently active in the table'
                    : 'The preset already matches the current active filter'
                }
              >
                <Button
                  size="small"
                  icon={<SyncOutlined />}
                  onClick={handleUseCurrentFilter}
                  disabled={!currentFilterDiffers}
                >
                  Use current filter
                </Button>
              </Tooltip>
            )}
          </div>

          {filterChanged && (
            <Alert
              type="info"
              showIcon
              message="Filter has been modified — click Save changes to persist."
              style={{ marginBottom: 10, fontSize: 12 }}
            />
          )}

          <div style={{ maxHeight: '45vh', overflowY: 'auto', paddingRight: 4 }}>
            <FilterBuilder value={filterDraft} onChange={setFilterDraft} />
          </div>

          {!hasValidFilter && (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              A preset must have at least one filter condition.
            </Typography.Text>
          )}
        </div>

      </Space>
    </Modal>
  );
}

export function PresetPanel({
  tenantId: _tenantId,
  userId,
  presets,
  currentFilters,
  onLoadPreset,
  onSavePreset,
  onEditPreset,
  onDeletePreset,
  canShare,
}: PresetPanelProps) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [editState, setEditState] = useState<EditModalState | null>(null);
  const [updateFilterTarget, setUpdateFilterTarget] = useState<FilterPreset | null>(null);

  const hasActiveFilter = buildFilterAst(currentFilters) !== null;
  const currentFilterAstStr = filtersToAst(currentFilters);

  const menuItems = presets.map((preset) => {
    const isOwner = preset.userId === userId;
    const canEdit = isOwner || preset.isShared;
    return {
      key: preset.id,
      label: (
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {preset.isShared && (
              <ShareAltOutlined style={{ marginRight: 4, color: '#1677ff' }} aria-label="Shared" />
            )}
            {preset.name}
            {preset.isShared && (
              <Tag color="blue" style={{ marginLeft: 6, fontSize: 10 }}>
                shared
              </Tag>
            )}
          </span>

          <Space size={2} onClick={(e) => e.stopPropagation()}>
            {canEdit && hasActiveFilter && currentFilterAstStr !== preset.filterAst && (
              <Tooltip title="Overwrite this preset's filter with the current active filter">
                <Button
                  type="text"
                  size="small"
                  icon={<SaveOutlined style={{ color: '#52c41a' }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setUpdateFilterTarget(preset);
                  }}
                  aria-label={`Update filter of preset ${preset.name} to current filter`}
                />
              </Tooltip>
            )}
            {canEdit && (
              <Tooltip title="Edit preset name, filter, or sharing">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditState({ preset });
                  }}
                  aria-label={`Edit preset ${preset.name}`}
                />
              </Tooltip>
            )}
            {canShare && isOwner && (
              <Tooltip title={preset.isShared ? 'Unshare' : 'Share with team'}>
                <Button
                  type="text"
                  size="small"
                  icon={
                    <ShareAltOutlined
                      style={{ color: preset.isShared ? '#1677ff' : undefined }}
                    />
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditPreset(preset.id, {
                      isShared: !preset.isShared,
                      version: preset.version,
                    });
                  }}
                  aria-label={
                    preset.isShared
                      ? `Unshare preset ${preset.name}`
                      : `Share preset ${preset.name}`
                  }
                />
              </Tooltip>
            )}
            {isOwner && (
              <Tooltip title="Delete preset">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePreset(preset.id);
                  }}
                  aria-label={`Delete preset ${preset.name}`}
                />
              </Tooltip>
            )}
          </Space>
        </Space>
      ),
      onClick: () => onLoadPreset(preset.filterAst),
    };
  });

  return (
    <>
      <Space size={4}>
        <Dropdown
          menu={{ items: menuItems }}
          disabled={presets.length === 0}
          trigger={['click']}
        >
          <Button
            icon={<BookOutlined aria-hidden />}
            aria-label="Load a saved filter preset"
            aria-haspopup="listbox"
          >
            Presets {presets.length > 0 ? `(${presets.length})` : ''}
          </Button>
        </Dropdown>

        {hasActiveFilter && (
          <Tooltip title="Save current filters as a preset">
            <Button
              icon={<PlusOutlined aria-hidden />}
              onClick={() => setSaveOpen(true)}
              aria-label="Save current filters as preset"
            >
              Save
            </Button>
          </Tooltip>
        )}
      </Space>

      <SaveModal
        open={saveOpen}
        canShare={canShare}
        onOk={(name, isShared) => {
          onSavePreset(name, isShared);
          setSaveOpen(false);
        }}
        onCancel={() => setSaveOpen(false)}
      />

      <EditModal
        state={editState}
        canShare={canShare}
        currentFilterAst={currentFilterAstStr}
        onOk={(id, patch) => {
          onEditPreset(id, patch);
          setEditState(null);
        }}
        onCancel={() => setEditState(null)}
      />

      <UpdateFilterConfirm
        preset={updateFilterTarget}
        newFilterAst={currentFilterAstStr}
        onConfirm={() => {
          if (updateFilterTarget && currentFilterAstStr) {
            onEditPreset(updateFilterTarget.id, {
              filterAst: currentFilterAstStr,
              version: updateFilterTarget.version,
            });
          }
          setUpdateFilterTarget(null);
        }}
        onCancel={() => setUpdateFilterTarget(null)}
      />
    </>
  );
}

export function filtersToAst(filters: PatientFilters): string | null {
  if (filters.filter) {
    try {
      const node = deserializeUrl(filters.filter);
      return serialize(node);
    } catch {
      return null;
    }
  }
  const ast = buildFilterAst(filters);
  if (!ast) return null;
  return serialize(ast);
}

export function astToFilterNode(filterAst: string): FilterNode | null {
  try {
    return deserialize(filterAst);
  } catch {
    return null;
  }
}
