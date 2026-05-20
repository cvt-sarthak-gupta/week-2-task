import type { FilterNode, CompareNode, RangeNode } from './types';
import type { Patient } from '@/shared/types';
import { exhaustiveCheck } from '@/shared/utils/assert';

function getField(patient: Patient, field: keyof Patient): string | number | boolean | undefined {
  return patient[field] as string | number | boolean | undefined;
}

function compareValues(op: CompareNode['op'], fieldVal: unknown, compareVal: string | number | boolean): boolean {
  if (fieldVal == null) return false;

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
    /* v8 ignore next 2 */
    default:
      return exhaustiveCheck(op);
  }
}

function evaluateRange(node: RangeNode, patient: Patient): boolean {
  const val = Number(getField(patient, node.field));
  if (isNaN(val)) return false;
  const minVal = Number(node.min);
  const maxVal = Number(node.max);
  const [minInc, maxInc] = node.inclusive;
  const passMin = minInc ? val >= minVal : val > minVal;
  const passMax = maxInc ? val <= maxVal : val < maxVal;
  return passMin && passMax;
}

/** Pure evaluator — no side effects. 100% branch coverage required. */
export function evaluate(node: FilterNode, patient: Patient): boolean {
  switch (node.kind) {
    case 'and':
      if (node.children.length === 0) return true;
      return node.children.every((child) => evaluate(child, patient));
    case 'or':
      if (node.children.length === 0) return false;
      return node.children.some((child) => evaluate(child, patient));
    case 'not':
      return !evaluate(node.child, patient);
    case 'compare':
      return compareValues(node.op, getField(patient, node.field), node.value);
    case 'range':
      return evaluateRange(node, patient);
    /* v8 ignore next 2 */
    default:
      return exhaustiveCheck(node);
  }
}
