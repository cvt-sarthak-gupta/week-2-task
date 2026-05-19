import type { FilterNode, CompareOp } from './filter-ast.types';

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

function decodeTypedValue(raw: string): string | number | boolean {
  if (raw.startsWith('b:')) return raw.slice(2) === 'true';
  if (raw.startsWith('n:')) return Number(raw.slice(2));
  if (raw.startsWith('s:')) return raw.slice(2);
  return raw === 'true' ? true : raw === 'false' ? false : (raw.trim() !== '' && !isNaN(Number(raw))) ? Number(raw) : raw;
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
      result = ident === 'and'
        ? { kind: 'and', children }
        : { kind: 'or', children };
    } else if (ident === 'not') {
      const child = this.parseNode();
      result = { kind: 'not', child };
    } else if (ident === 'range') {
      const field = this.expectIdent();
      this.expect('comma');
      const min = decodeTypedValue(this.expectIdent());
      this.expect('comma');
      const max = decodeTypedValue(this.expectIdent());
      this.expect('comma');
      const flags = this.expectIdent();
      const inclusive: [boolean, boolean] = [flags[0] === '1', flags[1] === '1'];
      result = { kind: 'range', field, min: min as string | number, max: max as string | number, inclusive };
    } else {
      const op = ident as CompareOp;
      const field = this.expectIdent();
      this.expect('comma');
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

  private expectValueIdent(): string {
    if (this.peek('rparen')) return 's:';
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

export function deserializeFilter(input: string): FilterNode {
  const tokens = tokenize(input);
  return new Parser(tokens).parse();
}
