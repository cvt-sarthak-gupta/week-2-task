import type { FilterNode, CompareNode, RangeNode, CompareOp } from './filter-ast.types';

function compareValues(op: CompareOp, fieldVal: unknown, compareVal: string | number | boolean): boolean {
  if (fieldVal === undefined || fieldVal === null) return false;

  switch (op) {
    case 'eq':
      return String(fieldVal).toLowerCase() === String(compareVal).toLowerCase();
    case 'neq':
      return String(fieldVal).toLowerCase() !== String(compareVal).toLowerCase();
    case 'contains':
      return String(fieldVal).toLowerCase().includes(String(compareVal).toLowerCase());
    case 'startsWith':
      return String(fieldVal).toLowerCase().startsWith(String(compareVal).toLowerCase());
    case 'gt':
      return Number(fieldVal) > Number(compareVal);
    case 'gte':
      return Number(fieldVal) >= Number(compareVal);
    case 'lt':
      return Number(fieldVal) < Number(compareVal);
    case 'lte':
      return Number(fieldVal) <= Number(compareVal);
    default: {
      const _: never = op;
      void _;
      return false;
    }
  }
}

function evaluateRange(node: RangeNode, record: Record<string, unknown>): boolean {
  const val = Number(record[node.field]);
  if (isNaN(val)) return false;
  const minVal = Number(node.min);
  const maxVal = Number(node.max);
  const [minInc, maxInc] = node.inclusive;
  const passMin = minInc ? val >= minVal : val > minVal;
  const passMax = maxInc ? val <= maxVal : val < maxVal;
  return passMin && passMax;
}

export function evaluateFilter(node: FilterNode, record: Record<string, unknown>): boolean {
  switch (node.kind) {
    case 'and':
      if (node.children.length === 0) return true;
      return node.children.every((child) => evaluateFilter(child, record));
    case 'or':
      if (node.children.length === 0) return false;
      return node.children.some((child) => evaluateFilter(child, record));
    case 'not':
      return !evaluateFilter(node.child, record);
    case 'compare': {
      const fieldVal = record[node.field as string];
      return compareValues(node.op, fieldVal, node.value);
    }
    case 'range':
      return evaluateRange(node, record);
    default: {
      const _: never = node;
      void _;
      return false;
    }
  }
}
