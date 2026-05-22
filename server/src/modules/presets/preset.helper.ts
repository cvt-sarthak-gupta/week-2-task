import { randomUUID } from 'node:crypto';

export class PresetHelper {
  static generateId(): string {
    return randomUUID();
  }
}
