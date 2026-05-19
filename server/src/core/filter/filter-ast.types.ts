/** Mirror of the client-side FilterNode types. Keep in sync with src/features/filters/ast/types.ts */

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
  readonly field: string;
  readonly op: CompareOp;
  readonly value: string | number | boolean;
}

export interface RangeNode {
  readonly kind: 'range';
  readonly field: string;
  readonly min: string | number;
  readonly max: string | number;
  readonly inclusive: readonly [boolean, boolean];
}
