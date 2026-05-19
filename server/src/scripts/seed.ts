import type { InMemoryStore } from '../infrastructure/inMemoryStore';
import type { PatientEntity } from '../modules/patients/patient.entity';

const STATUSES: PatientEntity['status'][] = ['critical', 'stable', 'discharged', 'pending', 'admitted'];
const WARDS = ['ICU', 'General', 'Cardiology', 'Pediatrics', 'Oncology', 'Emergency', 'Neurology', 'Orthopedics', 'Dermatology', 'Psychiatry'];
const FIRST_NAMES = [
  'Alice', 'Bob', 'Carol', 'David', 'Eva', 'Frank', 'Grace', 'Henry', 'Iris', 'James',
  'Karen', 'Lee', 'Maria', 'Noah', 'Olivia', 'Paul', 'Quinn', 'Rachel', 'Sam', 'Tara',
  'Uma', 'Victor', 'Wendy', 'Xander', 'Yara', 'Zoe', 'Aaron', 'Beth', 'Carlos', 'Diana',
  'Ethan', 'Fiona', 'George', 'Hannah', 'Ivan', 'Julia', 'Kevin', 'Laura', 'Mike', 'Nina',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Moore',
  'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Young', 'Allen',
  'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Carter', 'Mitchell', 'Perez',
  'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Morris',
];
const TENANTS = ['tenant-a', 'tenant-b', 'tenant-c'];

const NOW = Date.now();
const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

function updatedAtFor(idx: number): string {
  const spread = ((idx * 2654435761) >>> 0) % THIRTY_DAYS_MS;
  return new Date(NOW - spread).toISOString();
}

function pad(n: number, len = 6): string {
  return String(n).padStart(len, '0');
}

function seedVitals(idx: number, status: PatientEntity['status']): { heartRate: number; bp: string; temp: number; o2sat: number } {
  // Use idx as a deterministic seed for variety
  const base = (idx * 1664525 + 1013904223) >>> 0;
  const isCritical = status === 'critical';
  const heartRate = isCritical
    ? 40 + (base % 80)          // 40–119
    : 55 + (base % 46);         // 55–100
  const systolic = isCritical
    ? 80 + (base % 70)          // 80–149
    : 100 + (base % 60);        // 100–159
  const diastolic = isCritical
    ? 40 + (base % 40)          // 40–79
    : 60 + (base % 30);         // 60–89
  const tempBase = (((base >> 8) * 16807) >>> 0) % 30; // 0–29
  const temp = isCritical
    ? parseFloat((36.0 + tempBase / 10).toFixed(1))    // 36.0–38.9
    : parseFloat((36.0 + (tempBase % 20) / 10).toFixed(1)); // 36.0–37.9
  const o2sat = isCritical
    ? 82 + (base % 14)          // 82–95
    : 95 + (base % 6);          // 95–100

  return { heartRate, bp: `${systolic}/${diastolic}`, temp, o2sat };
}

export function seedPatients(store: InMemoryStore<PatientEntity>, countPerTenant = 50_000): void {
  store.clear();
  console.log(`Seeding ${(countPerTenant * TENANTS.length).toLocaleString()} patients (${countPerTenant.toLocaleString()} per tenant)…`);
  const start = Date.now();

  for (const tenantId of TENANTS) {
    process.stdout.write(`  ${tenantId}: building records…`);
    const tenantStart = Date.now();

    const patients: PatientEntity[] = Array.from({ length: countPerTenant }, (_, i) => {
      const idx = i + 1;
      const status = STATUSES[idx % STATUSES.length] ?? 'stable';
      const vitals = seedVitals(idx, status);
      const base: PatientEntity = {
        id: `${tenantId}-p-${pad(idx)}`,
        tenantId,
        mrn: `MRN-${pad(idx)}`,
        firstName: FIRST_NAMES[idx % FIRST_NAMES.length] ?? 'Alice',
        lastName: LAST_NAMES[idx % LAST_NAMES.length] ?? 'Smith',
        dob: `${1940 + (idx % 60)}-${String((idx % 12) + 1).padStart(2, '0')}-${String((idx % 28) + 1).padStart(2, '0')}`,
        age: 20 + (idx % 75),
        sex: idx % 2 === 0 ? 'M' : 'F',
        status,
        ward: WARDS[idx % WARDS.length] ?? 'General',
        assignedCoordinatorId: `coord-${(idx % 5) + 1}`,
        admittedAt: new Date(NOW - (idx % 730) * 24 * 3600 * 1000).toISOString(),
        updatedAt: updatedAtFor(idx),
        version: 1,
        heartRate: vitals.heartRate,
        bp: vitals.bp,
        temp: vitals.temp,
        o2sat: vitals.o2sat,
      };
      if (idx % 50 === 0) base.notes = `Patient ${idx} has follow-up scheduled.`;
      return base;
    });

    store.setMany(tenantId, patients);
    process.stdout.write(` done (${Date.now() - tenantStart}ms)\n`);
  }

  console.log(`Total seed time: ${Date.now() - start}ms`);
}
