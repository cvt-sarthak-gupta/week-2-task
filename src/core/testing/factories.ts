import type { Patient, PatientStatus } from '@/shared/types';

let counter = 0;

const STATUSES: readonly PatientStatus[] = ['critical', 'stable', 'discharged', 'pending', 'admitted'];
const WARDS = ['ICU', 'General', 'Cardiology', 'Pediatrics', 'Oncology'];
const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Eva', 'Frank', 'Grace', 'Henry'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];

export function makeMockPatient(overrides: Partial<Patient> = {}): Patient {
  const id = overrides.id ?? `p-${++counter}`;
  return {
    id,
    tenantId: overrides.tenantId ?? 'tenant-a',
    mrn: `MRN-${id.replace('p-', '').padStart(6, '0')}`,
    firstName: FIRST_NAMES[counter % FIRST_NAMES.length] ?? 'Alice',
    lastName: LAST_NAMES[counter % LAST_NAMES.length] ?? 'Smith',
    dob: '1965-03-15',
    age: 58 + (counter % 40),
    sex: counter % 2 === 0 ? 'M' : 'F',
    status: STATUSES[counter % STATUSES.length] ?? 'stable',
    ward: WARDS[counter % WARDS.length] ?? 'General',
    assignedCoordinatorId: 'u1',
    admittedAt: new Date(Date.now() - 1000 * 3600 * 24 * (counter % 30)).toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    ...(counter % 5 === 0 ? { notes: `Patient note #${counter}` } : {}),
    ...overrides,
  };
}

export function makeMockPatients(count: number, tenantId = 'tenant-a'): Patient[] {
  return Array.from({ length: count }, (_, i) => makeMockPatient({ id: `p-${i + 1}`, tenantId }));
}
