/**
 * Human-readable URL filter format.
 *
 * Designed to be copy-pasteable without percent-encoding for typical patient values.
 * Uses no characters that require URL-encoding in query string position.
 *
 * Grammar:
 *   expr     = group | leaf
 *   group    = ("and" | "or") "(" expr ("," expr)* ")"
 *            | "not" "(" expr ")"
 *   leaf     = field ":" op ":" value
 *            | field ":" "btwn" ":" min ":" max [":" flags]
 *   op       = "eq" | "ne" | "has" | "sw" | "gt" | "gte" | "lt" | "lte"
 *   flags    = "ii" | "ei" | "ie" | "ee"   (inclusive/exclusive per bound)
 *
 * Examples:
 *   status:eq:critical
 *   and(status:eq:critical,age:gte:65,ward:eq:ICU)
 *   or(status:eq:critical,status:eq:stable)
 *   not(age:lt:18)
 *   and(age:btwn:60:80,ward:eq:ICU)         ← both bounds inclusive (default)
 *   age:btwn:60:80:ei                        ← exclusive min, inclusive max
 *
 * Value escaping: literal "," → "\,", literal ")" → "\)", literal "\" → "\\"
 */

import type { FilterNode, CompareOp, PatientField } from './types';

// ---------------------------------------------------------------------------
// Operator maps
// ---------------------------------------------------------------------------

const OP_TO_URL: Record<CompareOp, string> = {
  eq:         'eq',
  neq:        'ne',
  contains:   'has',
  startsWith: 'sw',
  gt:         'gt',
  gte:        'gte',
  lt:         'lt',
  lte:        'lte',
};

const URL_TO_OP: Record<string, CompareOp> = {
  eq:  'eq',
  ne:  'neq',
  has: 'contains',
  sw:  'startsWith',
  gt:  'gt',
  gte: 'gte',
  lt:  'lt',
  lte: 'lte',
};

// ---------------------------------------------------------------------------
// Value encoding
// ---------------------------------------------------------------------------

function escapeVal(v: string): string {
  return v.replace(/[\\,)]/g, (c) => `\\${c}`);
}

function unescapeVal(v: string): string {
  return v.replace(/\\([\\,)])/g, '$1');
}

/** Infer the typed value from a raw string — no explicit type prefix needed. */
function inferValue(raw: string): string | number | boolean {
  const unescaped = unescapeVal(raw);
  if (unescaped === 'true') return true;
  if (unescaped === 'false') return false;
  if (unescaped.trim() !== '' && !isNaN(Number(unescaped))) return Number(unescaped);
  return unescaped;
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

export function serializeUrl(node: FilterNode): string {
  switch (node.kind) {
    case 'and':
      return `and(${node.children.map(serializeUrl).join(',')})`;
    case 'or':
      return `or(${node.children.map(serializeUrl).join(',')})`;
    case 'not':
      return `not(${serializeUrl(node.child)})`;
    case 'compare': {
      const op = OP_TO_URL[node.op];
      return `${node.field}:${op}:${escapeVal(String(node.value))}`;
    }
    case 'range': {
      const [minInc, maxInc] = node.inclusive;
      const bothInclusive = minInc && maxInc;
      const flags = bothInclusive ? '' : `:${minInc ? 'i' : 'e'}${maxInc ? 'i' : 'e'}`;
      return `${node.field}:btwn:${escapeVal(String(node.min))}:${escapeVal(String(node.max))}${flags}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Deserializer
// ---------------------------------------------------------------------------

export function deserializeUrl(input: string): FilterNode {
  const parser = new UrlParser(input);
  return parser.parse();
}

class UrlParser {
  private pos = 0;

  constructor(private readonly input: string) {}

  parse(): FilterNode {
    const node = this.parseExpr();
    if (this.pos < this.input.length) {
      throw new Error(`Unexpected input at position ${this.pos}: "${this.input.slice(this.pos)}"`);
    }
    return node;
  }

  private parseExpr(): FilterNode {
    const word = this.readWord();

    if (word === 'and' || word === 'or') {
      this.expect('(');
      const children: FilterNode[] = [];
      if (!this.peekChar(')')) {
        children.push(this.parseExpr());
        while (this.peekChar(',')) {
          this.consume();
          if (this.peekChar(')')) break;
          children.push(this.parseExpr());
        }
      }
      this.expect(')');
      return word === 'and' ? { kind: 'and', children } : { kind: 'or', children };
    }

    if (word === 'not') {
      this.expect('(');
      const child = this.parseExpr();
      this.expect(')');
      return { kind: 'not', child };
    }

    // Leaf: field:op:...
    const field = word as PatientField;
    this.expect(':');
    const op = this.readWord();

    if (op === 'btwn') {
      this.expect(':');
      const minRaw = this.readSegment(); // stops at ':' ',' ')'
      this.expect(':');
      const maxRaw = this.readSegment(); // stops at ':' ',' ')'
      let minInc = true;
      let maxInc = true;
      if (this.peekChar(':')) {
        this.consume();
        const flags = this.readWord(); // "ii" "ei" "ie" "ee"
        minInc = (flags[0] ?? 'i') !== 'e';
        maxInc = (flags[1] ?? 'i') !== 'e';
      }
      const min = inferValue(minRaw);
      const max = inferValue(maxRaw);
      return {
        kind: 'range',
        field,
        min: min as string | number,
        max: max as string | number,
        inclusive: [minInc, maxInc],
      };
    }

    const compareOp = URL_TO_OP[op];
    if (!compareOp) throw new Error(`Unknown operator "${op}"`);
    this.expect(':');
    const valueRaw = this.readValue(); // stops at unescaped ',' ')'
    return {
      kind: 'compare',
      field,
      op: compareOp,
      value: inferValue(valueRaw) as string | number | boolean,
    };
  }

  /** Read letters/digits until a structural character. */
  private readWord(): string {
    const start = this.pos;
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]!;
      if (ch === ':' || ch === '(' || ch === ')' || ch === ',') break;
      this.pos++;
    }
    if (this.pos === start) throw new Error(`Expected word at position ${this.pos}`);
    return this.input.slice(start, this.pos);
  }

  /** Read a range segment — stops at unescaped ':' ',' ')'. */
  private readSegment(): string {
    let s = '';
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]!;
      if (ch === '\\') { this.pos++; s += this.input[this.pos] ?? ''; this.pos++; continue; }
      if (ch === ':' || ch === ',' || ch === ')') break;
      s += ch;
      this.pos++;
    }
    return s;
  }

  /** Read a compare value — stops at unescaped ',' ')'. */
  private readValue(): string {
    let s = '';
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]!;
      if (ch === '\\') { this.pos++; s += this.input[this.pos] ?? ''; this.pos++; continue; }
      if (ch === ',' || ch === ')') break;
      s += ch;
      this.pos++;
    }
    return s;
  }

  private expect(char: string): void {
    if (this.input[this.pos] !== char) {
      throw new Error(`Expected '${char}' at pos ${this.pos}, got '${this.input[this.pos] ?? 'EOF'}'`);
    }
    this.pos++;
  }

  private peekChar(char: string): boolean {
    return this.input[this.pos] === char;
  }

  private consume(): void { this.pos++; }
}
