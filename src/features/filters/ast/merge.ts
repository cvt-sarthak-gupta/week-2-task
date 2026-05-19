import type { Patient } from '@/shared/types';

/**
 * Merges client-side and server-side patient result sets.
 * Deduplicates by id. Server results take precedence (fresher data).
 * Preserves original ordering: client results first (already sorted), server appends new.
 */
export function mergeResults(
  clientIds: readonly string[],
  serverPatients: readonly Patient[],
  localById: ReadonlyMap<string, Patient>,
): Patient[] {
  const seen = new Set<string>();
  const merged: Patient[] = [];

  // Client results first (apply local data)
  for (const id of clientIds) {
    const patient = localById.get(id);
    if (patient) {
      seen.add(id);
      merged.push(patient);
    }
  }

  // Server results — add new ones (those not in client set)
  for (const patient of serverPatients) {
    if (!seen.has(patient.id)) {
      seen.add(patient.id);
      merged.push(patient);
    }
  }

  return merged;
}

/** Deduplicates an array of patients by id, keeping the entry with the higher version. */
export function deduplicateById(patients: readonly Patient[]): Patient[] {
  const byId = new Map<string, Patient>();
  for (const p of patients) {
    const existing = byId.get(p.id);
    if (!existing || p.version > existing.version) {
      byId.set(p.id, p);
    }
  }
  return Array.from(byId.values());
}
