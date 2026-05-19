import type { Patient, PatientStatus, PatientSex } from '@/shared/types';

/** All filterable fields and their value types — correlated via conditional type. */
export type PatientField = keyof Patient;

export type CompareOp = 'eq' | 'neq' | 'contains' | 'startsWith' | 'gt' | 'gte' | 'lt' | 'lte';

export type FilterNode =
  | AndNode
  | OrNode
  | NotNode
  | CompareNode
  | RangeNode;

export interface AndNode {
  readonly kind: 'and';
  readonly children: readonly FilterNode[];
}

export interface OrNode {
  readonly kind: 'or';
  readonly children: readonly FilterNode[];
}

export interface NotNode {
  readonly kind: 'not';
  readonly child: FilterNode;
}

export interface CompareNode {
  readonly kind: 'compare';
  readonly field: PatientField;
  readonly op: CompareOp;
  readonly value: string | number | boolean;
}

export interface RangeNode {
  readonly kind: 'range';
  readonly field: PatientField;
  readonly min: string | number;
  readonly max: string | number;
  /** [minInclusive, maxInclusive] */
  readonly inclusive: readonly [boolean, boolean];
}

/** Safe constructors */
export const Filter = {
  and: (...children: FilterNode[]): AndNode => ({ kind: 'and', children }),
  or: (...children: FilterNode[]): OrNode => ({ kind: 'or', children }),
  not: (child: FilterNode): NotNode => ({ kind: 'not', child }),
  eq: (field: PatientField, value: string | number | boolean): CompareNode => ({ kind: 'compare', field, op: 'eq', value }),
  neq: (field: PatientField, value: string | number | boolean): CompareNode => ({ kind: 'compare', field, op: 'neq', value }),
  contains: (field: PatientField, value: string): CompareNode => ({ kind: 'compare', field, op: 'contains', value }),
  startsWith: (field: PatientField, value: string): CompareNode => ({ kind: 'compare', field, op: 'startsWith', value }),
  gt: (field: PatientField, value: number | string): CompareNode => ({ kind: 'compare', field, op: 'gt', value }),
  gte: (field: PatientField, value: number | string): CompareNode => ({ kind: 'compare', field, op: 'gte', value }),
  lt: (field: PatientField, value: number | string): CompareNode => ({ kind: 'compare', field, op: 'lt', value }),
  lte: (field: PatientField, value: number | string): CompareNode => ({ kind: 'compare', field, op: 'lte', value }),
  range: (field: PatientField, min: number | string, max: number | string, inclusive: readonly [boolean, boolean] = [true, true]): RangeNode => ({
    kind: 'range', field, min, max, inclusive,
  }),
} as const;
