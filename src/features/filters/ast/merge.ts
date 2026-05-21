import type { Patient } from '@/shared/types';

export function mergeResults(
  clientIds: readonly string[],
  serverPatients: readonly Patient[],
  localById: ReadonlyMap<string, Patient>,
): Patient[] {
  const seen = new Set<string>();
  const merged: Patient[] = [];

  for (const id of clientIds) {
    const patient = localById.get(id);
    if (patient) {
      seen.add(id);
      merged.push(patient);
    }
  }

  for (const patient of serverPatients) {
    if (!seen.has(patient.id)) {
      seen.add(patient.id);
      merged.push(patient);
    }
  }

  return merged;
}

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
