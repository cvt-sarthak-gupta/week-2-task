import type { Patient } from '@/shared/types';

export type DiffOp =
  | { type: 'add'; patient: Patient }
  | { type: 'update'; patient: Patient; prev: Patient }
  | { type: 'remove'; id: string };

/**
 * Computes the minimal diff between local cached state and incoming server state.
 * Pure function — 100% branch coverage required.
 */
export function computeDiff(
  local: readonly Patient[],
  server: readonly Patient[],
): readonly DiffOp[] {
  const localById = new Map<string, Patient>(local.map((p) => [p.id, p]));
  const serverById = new Map<string, Patient>(server.map((p) => [p.id, p]));
  const ops: DiffOp[] = [];

  // Check server rows against local
  for (const serverPatient of server) {
    const localPatient = localById.get(serverPatient.id);
    if (!localPatient) {
      ops.push({ type: 'add', patient: serverPatient });
    } else if (serverPatient.version > localPatient.version) {
      ops.push({ type: 'update', patient: serverPatient, prev: localPatient });
    }
    // Equal or lower version: no-op (local is ahead or same)
  }

  // Check for removals (local has rows server doesn't)
  for (const localPatient of local) {
    if (!serverById.has(localPatient.id)) {
      ops.push({ type: 'remove', id: localPatient.id });
    }
  }

  return ops;
}

/** Applies a diff to a local dataset, returning a new array. */
export function applyDiff(local: readonly Patient[], diff: readonly DiffOp[]): Patient[] {
  const byId = new Map<string, Patient>(local.map((p) => [p.id, p]));

  for (const op of diff) {
    switch (op.type) {
      case 'add':
        byId.set(op.patient.id, op.patient);
        break;
      case 'update':
        byId.set(op.patient.id, op.patient);
        break;
      case 'remove':
        byId.delete(op.id);
        break;
    }
  }

  return Array.from(byId.values());
}
