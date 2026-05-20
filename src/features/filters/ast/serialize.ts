import type { FilterNode, CompareOp } from './types';
import { Filter } from './types';
import type { Patient } from '@/shared/types';
import { exhaustiveCheck } from '@/shared/utils/assert';

/**
 * Serializes a FilterNode to a compact, URL-safe string.
 * Values are type-prefixed to preserve round-trip fidelity:
 *   s:alice  → string "alice"
 *   n:65     → number 65
 *   b:true   → boolean true
 * e.g. and(eq(status,s:critical),gte(age,n:65))
 */
export function serialize(node: FilterNode): string {
  switch (node.kind) {
    case 'and':
      return `and(${node.children.map(serialize).join(',')})`;
    case 'or':
      return `or(${node.children.map(serialize).join(',')})`;
    case 'not':
      return `not(${serialize(node.child)})`;
    case 'compare':
      return `${node.op}(${node.field},${encodeTypedValue(node.value)})`;
    case 'range':
      return `range(${node.field},${encodeTypedValue(node.min)},${encodeTypedValue(node.max)},${node.inclusive[0] ? '1' : '0'}${node.inclusive[1] ? '1' : '0'})`;
    /* v8 ignore next 2 */
    default:
      return exhaustiveCheck(node);
  }
}

function escapeStr(s: string): string {
  return s.replace(/[(),\\]/g, (c) => `\\${c}`);
}

function encodeTypedValue(v: string | number | boolean): string {
  if (typeof v === 'boolean') return `b:${v ? 'true' : 'false'}`;
  if (typeof v === 'number') return `n:${v}`;
  return `s:${escapeStr(v)}`;
}

function decodeTypedValue(raw: string): string | number | boolean {
  if (raw.startsWith('b:')) return raw.slice(2) === 'true';
  if (raw.startsWith('n:')) return Number(raw.slice(2));
  // The tokenizer already strips backslash escapes before passing raw here —
  // calling unescapeStr again would double-unescape (e.g. "\(" → "(").
  if (raw.startsWith('s:')) return raw.slice(2);
  // Legacy fallback for values without type prefix
  return raw === 'true' ? true : raw === 'false' ? false : (raw.trim() !== '' && !isNaN(Number(raw))) ? Number(raw) : raw;
}

type Token = { type: 'lparen' } | { type: 'rparen' } | { type: 'comma' } | { type: 'ident'; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === '(') { tokens.push({ type: 'lparen' }); i++; }
    else if (ch === ')') { tokens.push({ type: 'rparen' }); i++; }
    else if (ch === ',') { tokens.push({ type: 'comma' }); i++; }
    else {
      let s = '';
      while (i < input.length && input[i] !== '(' && input[i] !== ')' && input[i] !== ',') {
        if (input[i] === '\\') {
          i++;
          s += input[i] ?? '';
        } else {
          s += input[i]!;
        }
        i++;
      }
      tokens.push({ type: 'ident', value: s });
    }
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): FilterNode {
    const node = this.parseNode();
    if (this.pos < this.tokens.length) throw new Error('Unexpected tokens after expression');
    return node;
  }

  private parseNode(): FilterNode {
    const ident = this.expectIdent();
    this.expect('lparen');

    let result: FilterNode;

    if (ident === 'and' || ident === 'or') {
      const children: FilterNode[] = [];
      if (!this.peek('rparen')) {
        children.push(this.parseNode());
        while (this.peek('comma')) {
          this.consume();
          if (this.peek('rparen')) break;
          children.push(this.parseNode());
        }
      }
      result = ident === 'and' ? Filter.and(...children) : Filter.or(...children);
    } else if (ident === 'not') {
      const child = this.parseNode();
      result = Filter.not(child);
    } else if (ident === 'range') {
      const field = this.expectIdent() as keyof Patient;
      this.expect('comma');
      const min = decodeTypedValue(this.expectIdent());
      this.expect('comma');
      const max = decodeTypedValue(this.expectIdent());
      this.expect('comma');
      const flags = this.expectIdent();
      const inclusive: [boolean, boolean] = [flags[0] === '1', flags[1] === '1'];
      result = Filter.range(field, min as string | number, max as string | number, inclusive);
    } else {
      // compare node: op(field,value)
      const op = ident as CompareOp;
      const field = this.expectIdent() as keyof Patient;
      this.expect('comma');
      // expectValueIdent allows empty string values (next token is ')' when value is "")
      const value = decodeTypedValue(this.expectValueIdent());
      result = { kind: 'compare', field, op, value: value as string | number | boolean };
    }

    this.expect('rparen');
    return result;
  }

  private expectIdent(): string {
    const t = this.tokens[this.pos];
    if (!t || t.type !== 'ident') throw new Error(`Expected identifier at pos ${this.pos}`);
    this.pos++;
    return t.value;
  }

  /** Like expectIdent but returns the type-prefix sentinel for empty string when the next token is ')'. */
  private expectValueIdent(): string {
    if (this.peek('rparen')) return 's:'; // empty string encoded as "s:" with no body
    return this.expectIdent();
  }

  private expect(type: Token['type']): void {
    const t = this.tokens[this.pos];
    if (!t || t.type !== type) throw new Error(`Expected ${type} at pos ${this.pos}, got ${t?.type}`);
    this.pos++;
  }

  private peek(type: Token['type']): boolean {
    return this.tokens[this.pos]?.type === type;
  }

  private consume(): void {
    this.pos++;
  }
}

export function deserialize(input: string): FilterNode {
  const tokens = tokenize(input);
  return new Parser(tokens).parse();
}

export function serializeToUrlParam(node: FilterNode): string {
  return encodeURIComponent(serialize(node));
}

export function deserializeFromUrlParam(param: string): FilterNode {
  return deserialize(decodeURIComponent(param));
}
