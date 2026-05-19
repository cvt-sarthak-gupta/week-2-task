export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

export function assertDefined<T>(value: T | null | undefined, name: string): T {
  if (value == null) throw new Error(`Expected ${name} to be defined`);
  return value;
}

export function exhaustiveCheck(value: never): never {
  throw new Error(`Unhandled discriminated union value: ${JSON.stringify(value)}`);
}
