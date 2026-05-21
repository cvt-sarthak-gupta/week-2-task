import { Button, Select, Input, InputNumber, Space, Checkbox, Divider, Tag, Tooltip } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SwapOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { FilterNode, AndNode, OrNode, CompareOp, PatientField } from './ast/types';
import { Filter } from './ast/types';
import { FILTERABLE_FIELDS, getFieldMeta } from './fieldMeta';

type GroupLogic = 'and' | 'or';

const STRING_OPS: { value: CompareOp; label: string }[] = [
  { value: 'eq',         label: 'equals' },
  { value: 'neq',        label: 'not equals' },
  { value: 'contains',   label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
];

const NUMBER_OPS: { value: CompareOp | 'range'; label: string }[] = [
  { value: 'eq',    label: 'equals' },
  { value: 'neq',   label: 'not equals' },
  { value: 'gt',    label: '>' },
  { value: 'gte',   label: '>=' },
  { value: 'lt',    label: '<' },
  { value: 'lte',   label: '<=' },
  { value: 'range', label: 'between' },
];

const ENUM_OPS: { value: CompareOp; label: string }[] = [
  { value: 'eq',  label: 'is' },
  { value: 'neq', label: 'is not' },
];

const DATE_OPS: { value: CompareOp; label: string }[] = [
  { value: 'eq',  label: 'on' },
  { value: 'gt',  label: 'after' },
  { value: 'gte', label: 'on or after' },
  { value: 'lt',  label: 'before' },
  { value: 'lte', label: 'on or before' },
];

function opsForField(field: PatientField): { value: string; label: string }[] {
  const meta = getFieldMeta(field);
  switch (meta.type) {
    case 'number': return NUMBER_OPS;
    case 'enum':   return ENUM_OPS;
    case 'date':   return DATE_OPS;
    default:       return STRING_OPS;
  }
}

function defaultOpForField(field: PatientField): CompareOp | 'range' {
  const meta = getFieldMeta(field);
  switch (meta.type) {
    case 'number': return 'eq';
    case 'enum':   return 'eq';
    case 'date':   return 'gte';
    default:       return 'contains';
  }
}

type UpdateFn = (node: FilterNode) => void;

function replaceNode(root: FilterNode, target: FilterNode, replacement: FilterNode): FilterNode {
  if (root === target) return replacement;
  switch (root.kind) {
    case 'and': return { ...root, children: root.children.map((c) => replaceNode(c, target, replacement)) };
    case 'or':  return { ...root, children: root.children.map((c) => replaceNode(c, target, replacement)) };
    case 'not': return { ...root, child: replaceNode(root.child, target, replacement) };
    default:    return root;
  }
}

function removeNode(root: FilterNode, target: FilterNode): FilterNode | null {
  if (root === target) return null;
  switch (root.kind) {
    case 'and':
    case 'or': {
      const children = root.children
        .map((c) => removeNode(c, target))
        .filter((c): c is FilterNode => c !== null);
      return { ...root, children } as AndNode | OrNode;
    }
    case 'not': {
      const child = removeNode(root.child, target);
      if (!child) return null;
      return { ...root, child };
    }
    default:
      return root;
  }
}

function appendToGroup(root: FilterNode, group: FilterNode, child: FilterNode): FilterNode {
  if (root === group) {
    if (root.kind !== 'and' && root.kind !== 'or') return root;
    return { ...root, children: [...root.children, child] } as AndNode | OrNode;
  }
  switch (root.kind) {
    case 'and':
    case 'or':
      return { ...root, children: root.children.map((c) => appendToGroup(c, group, child)) } as AndNode | OrNode;
    case 'not':
      return { ...root, child: appendToGroup(root.child, group, child) };
    default:
      return root;
  }
}

interface NodeProps {
  node: FilterNode;
  root: FilterNode;
  onRootChange: UpdateFn;
  onDelete: (() => void) | null;
  depth: number;
}

function FilterBuilderNode(props: NodeProps) {
  const { node, ...rest } = props;
  switch (node.kind) {
    case 'and':
    case 'or':
      return <FilterBuilderGroup {...rest} node={node} />;
    case 'not':
      return <FilterBuilderNot {...rest} node={node} />;
    case 'compare':
    case 'range':
      return <FilterBuilderLeaf {...rest} node={node} />;
  }
}

function FilterBuilderGroup({ node, root, onRootChange, onDelete, depth }: NodeProps & { node: AndNode | OrNode }) {
  const logic = node.kind as GroupLogic;
  const borderColor = depth === 0 ? '#d9d9d9' : logic === 'and' ? '#1677ff44' : '#52c41a44';
  const bgColor = depth === 0 ? '#fafafa' : logic === 'and' ? '#e6f4ff44' : '#f6ffed44';

  const handleToggleLogic = () => {
    const next = logic === 'and' ? 'or' : 'and';
    const newGroup: FilterNode = next === 'and'
      ? { kind: 'and', children: node.children }
      : { kind: 'or',  children: node.children };
    onRootChange(replaceNode(root, node, newGroup));
  };

  const handleAddCondition = () => {
    const defaultField: PatientField = 'status';
    const newLeaf = Filter.eq(defaultField, '');
    onRootChange(appendToGroup(root, node, newLeaf));
  };

  const handleAddGroup = () => {
    const newGroup = Filter.and(Filter.eq('status' as PatientField, ''));
    onRootChange(appendToGroup(root, node, newGroup));
  };

  const handleWrapNot = () => {
    const wrapped: FilterNode = { kind: 'not', child: node };
    onRootChange(replaceNode(root, node, wrapped));
  };

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        padding: '8px 12px',
        background: bgColor,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Tooltip title={`Switch to ${logic === 'and' ? 'OR' : 'AND'}`}>
          <Tag
            color={logic === 'and' ? 'blue' : 'green'}
            style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}
            onClick={handleToggleLogic}
            aria-label={`Group logic: ${logic.toUpperCase()}. Click to toggle.`}
          >
            {logic.toUpperCase()} <SwapOutlined style={{ marginLeft: 4 }} />
          </Tag>
        </Tooltip>
        <span style={{ fontSize: 11, color: '#8c8c8c' }}>
          Match {logic === 'and' ? 'all' : 'any'} of the following
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <Tooltip title="Negate this group (NOT)">
            <Button size="small" type="text" icon={<StopOutlined />} onClick={handleWrapNot} aria-label="Wrap group in NOT" />
          </Tooltip>
          {onDelete && (
            <Tooltip title="Remove group">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={onDelete} aria-label="Delete group" />
            </Tooltip>
          )}
        </div>
      </div>

      {node.children.map((child, idx) => {
        const handleChildUpdate: UpdateFn = (newRoot) => onRootChange(newRoot);
        const handleChildDelete = () => {
          const next = removeNode(root, child);
          if (next) onRootChange(next);
        };
        return (
          <FilterBuilderNode
            key={idx}
            node={child}
            root={root}
            onRootChange={handleChildUpdate}
            onDelete={handleChildDelete}
            depth={depth + 1}
          />
        );
      })}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={handleAddCondition}>
          Add condition
        </Button>
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={handleAddGroup}>
          Add group
        </Button>
      </div>
    </div>
  );
}

function FilterBuilderNot({ node, root, onRootChange, onDelete, depth }: NodeProps & { node: { kind: 'not'; child: FilterNode } }) {
  const handleUnwrap = () => {
    onRootChange(replaceNode(root, node, node.child));
  };

  return (
    <div
      style={{
        border: '1px solid #ff4d4f55',
        borderRadius: 8,
        padding: '6px 12px',
        background: '#fff1f044',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Tag color="red" style={{ fontWeight: 700, letterSpacing: 0.5 }}>NOT</Tag>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <Tooltip title="Remove NOT wrapper">
            <Button size="small" type="text" onClick={handleUnwrap} aria-label="Remove NOT wrapper">Unwrap</Button>
          </Tooltip>
          {onDelete && (
            <Tooltip title="Delete this condition">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={onDelete} aria-label="Delete NOT node" />
            </Tooltip>
          )}
        </div>
      </div>
      <FilterBuilderNode
        node={node.child}
        root={root}
        onRootChange={onRootChange}
        onDelete={null}
        depth={depth + 1}
      />
    </div>
  );
}

function FilterBuilderLeaf({ node, root, onRootChange, onDelete }: NodeProps & { node: FilterNode & { kind: 'compare' | 'range' } }) {
  const isRange = node.kind === 'range';
  const currentField = node.field as PatientField;
  const fieldMeta = getFieldMeta(currentField);
  const ops = opsForField(currentField);

  const currentOp = isRange ? 'range' : (node as { op: CompareOp }).op;

  const handleFieldChange = (newField: PatientField) => {
    const newMeta = getFieldMeta(newField);
    let newNode: FilterNode;
    if (newMeta.type === 'number') {
      newNode = Filter.eq(newField, 0);
    } else if (newMeta.type === 'enum' && newMeta.options?.[0]) {
      newNode = Filter.eq(newField, newMeta.options[0]);
    } else {
      newNode = Filter.eq(newField, '');
    }
    onRootChange(replaceNode(root, node, newNode));
  };

  const handleOpChange = (newOp: string) => {
    if (newOp === 'range') {
      const newNode = Filter.range(currentField, 0, 100);
      onRootChange(replaceNode(root, node, newNode));
    } else {
      const op = newOp as CompareOp;
      const value = isRange ? node.min : (node as { value: string | number | boolean }).value;
      const newNode = Filter.eq(currentField, value as string | number | boolean);
      onRootChange(replaceNode(root, node, { ...newNode, op }));
    }
  };

  const handleWrapNot = () => {
    const wrapped: FilterNode = { kind: 'not', child: node };
    onRootChange(replaceNode(root, node, wrapped));
  };

  const handleValueChange = (newValue: string | number | boolean) => {
    if (isRange) return;
    const updated: FilterNode = { kind: 'compare', field: currentField, op: currentOp as CompareOp, value: newValue };
    onRootChange(replaceNode(root, node, updated));
  };

  const handleRangeChange = (side: 'min' | 'max', newValue: number) => {
    if (!isRange) return;
    const rangeNode = node as { kind: 'range'; field: PatientField; min: number; max: number; inclusive: readonly [boolean, boolean] };
    const updated = Filter.range(
      currentField,
      side === 'min' ? newValue : rangeNode.min,
      side === 'max' ? newValue : rangeNode.max,
      rangeNode.inclusive,
    );
    onRootChange(replaceNode(root, node, updated));
  };

  const handleInclusiveChange = (side: 0 | 1, checked: boolean) => {
    if (!isRange) return;
    const rangeNode = node as { kind: 'range'; field: PatientField; min: number; max: number; inclusive: readonly [boolean, boolean] };
    const inc: [boolean, boolean] = side === 0
      ? [checked, rangeNode.inclusive[1]]
      : [rangeNode.inclusive[0], checked];
    const updated = Filter.range(currentField, rangeNode.min, rangeNode.max, inc);
    onRootChange(replaceNode(root, node, updated));
  };

  const fieldOptions = FILTERABLE_FIELDS.map(({ field, meta }) => ({ value: field, label: meta.label }));

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        background: '#fff',
        border: '1px solid #f0f0f0',
        borderRadius: 6,
      }}
    >
      <Select
        size="small"
        value={currentField}
        onChange={handleFieldChange}
        options={fieldOptions}
        style={{ width: 130 }}
        aria-label="Filter field"
      />

      <Select
        size="small"
        value={currentOp}
        onChange={handleOpChange}
        options={ops}
        style={{ width: 110 }}
        aria-label="Filter operator"
      />

      {isRange ? (
        <RangeInputs
          node={node as { kind: 'range'; field: PatientField; min: number | string; max: number | string; inclusive: readonly [boolean, boolean] }}
          onRangeChange={handleRangeChange}
          onInclusiveChange={handleInclusiveChange}
        />
      ) : (
        <ValueInput
          field={currentField}
          meta={fieldMeta}
          value={(node as { value: string | number | boolean }).value}
          onChange={handleValueChange}
        />
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
        <Tooltip title="Negate this condition (NOT)">
          <Button size="small" type="text" icon={<StopOutlined />} onClick={handleWrapNot} aria-label="Negate condition" />
        </Tooltip>
        {onDelete && (
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={onDelete} aria-label="Delete condition" />
        )}
      </div>
    </div>
  );
}

interface ValueInputProps {
  field: PatientField;
  meta: ReturnType<typeof getFieldMeta>;
  value: string | number | boolean;
  onChange: (v: string | number | boolean) => void;
}

function ValueInput({ field: _field, meta, value, onChange }: ValueInputProps) {
  if (meta.type === 'enum' && meta.options) {
    return (
      <Select
        size="small"
        value={String(value)}
        onChange={(v) => onChange(v)}
        options={meta.options.map((o) => ({ value: o, label: o }))}
        style={{ width: 130 }}
        aria-label="Filter value"
      />
    );
  }
  if (meta.type === 'number') {
    return (
      <InputNumber
        size="small"
        value={Number(value)}
        onChange={(v) => onChange(v ?? 0)}
        style={{ width: 90 }}
        aria-label="Filter value"
      />
    );
  }
  return (
    <Input
      size="small"
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: 150 }}
      aria-label="Filter value"
    />
  );
}

interface RangeInputsProps {
  node: { kind: 'range'; field: PatientField; min: number | string; max: number | string; inclusive: readonly [boolean, boolean] };
  onRangeChange: (side: 'min' | 'max', v: number) => void;
  onInclusiveChange: (side: 0 | 1, checked: boolean) => void;
}

function RangeInputs({ node, onRangeChange, onInclusiveChange }: RangeInputsProps) {
  return (
    <Space size={4} wrap>
      <Checkbox
        checked={node.inclusive[0]}
        onChange={(e) => onInclusiveChange(0, e.target.checked)}
        aria-label="Min inclusive"
      >≥</Checkbox>
      <InputNumber
        size="small"
        value={Number(node.min)}
        onChange={(v) => onRangeChange('min', v ?? 0)}
        style={{ width: 72 }}
        aria-label="Range minimum"
      />
      <span style={{ color: '#8c8c8c' }}>–</span>
      <InputNumber
        size="small"
        value={Number(node.max)}
        onChange={(v) => onRangeChange('max', v ?? 0)}
        style={{ width: 72 }}
        aria-label="Range maximum"
      />
      <Checkbox
        checked={node.inclusive[1]}
        onChange={(e) => onInclusiveChange(1, e.target.checked)}
        aria-label="Max inclusive"
      >≤</Checkbox>
    </Space>
  );
}

export interface FilterBuilderProps {
  value: FilterNode | null;
  onChange: (node: FilterNode | null) => void;
}

export function FilterBuilder({ value, onChange }: FilterBuilderProps) {
  const root: FilterNode = value ?? Filter.and();

  const handleRootChange: UpdateFn = (newRoot) => {
    if (newRoot.kind === 'and' && newRoot.children.length === 0) {
      onChange(null);
    } else {
      onChange(newRoot);
    }
  };

  const handleClear = () => onChange(null);

  const displayRoot = (root.kind === 'and' || root.kind === 'or')
    ? root
    : Filter.and(root);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <FilterBuilderNode
        node={displayRoot}
        root={displayRoot}
        onRootChange={handleRootChange}
        onDelete={null}
        depth={0}
      />
      <Divider style={{ margin: '4px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" type="text" danger onClick={handleClear} disabled={!value}>
          Clear all
        </Button>
      </div>
    </div>
  );
}
