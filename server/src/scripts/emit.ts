const BASE_URL     = 'http://localhost:3001';
const PATIENT_COUNT = parseInt(process.env['PATIENT_COUNT'] ?? '50000', 10);
const BATCH_SIZE    = parseInt(process.env['BATCH_SIZE']    ?? '50',    10);
const TICK_MS       = parseInt(process.env['TICK_MS']       ?? '200',   10);
const TENANT        = process.env['TENANT'] ?? 'tenant-a';

const STATUSES = ['critical', 'stable', 'admitted', 'pending', 'stable', 'stable'] as const;

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomVitals(status: string): { heartRate: number; bp: string; temp: number; o2sat: number } {
  const isCritical = status === 'critical';
  const heartRate = isCritical ? randInt(40, 119) : randInt(55, 100);
  const systolic  = isCritical ? randInt(80, 149) : randInt(100, 159);
  const diastolic = isCritical ? randInt(40, 79)  : randInt(60, 89);
  const temp      = parseFloat(
    (isCritical ? 36.0 + randInt(0, 29) / 10 : 36.0 + randInt(0, 19) / 10).toFixed(1),
  );
  const o2sat = isCritical ? randInt(82, 95) : randInt(95, 100);
  return { heartRate, bp: `${systolic}/${diastolic}`, temp, o2sat };
}

async function getToken(): Promise<string> {
  const provided = process.env['TOKEN'] ?? '';
  if (provided) return provided;

  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'coordinator@tenant-a.com', password: 'password123' }),
  });

  if (!res.ok) {
    console.error(`ERROR: Could not auto-login (${res.status}). Is the server running at ${BASE_URL}?`);
    process.exit(1);
  }

  const data = await res.json() as { accessToken?: string };
  if (!data.accessToken) {
    console.error('ERROR: Login response did not include accessToken.');
    process.exit(1);
  }

  return data.accessToken;
}

function pad(n: number): string {
  return String(n).padStart(6, '0');
}

async function patchPatient(token: string, id: string, status: string): Promise<void> {
  const vitals = randomVitals(status);
  const res = await fetch(`${BASE_URL}/patients/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ status, ...vitals }),
  });

  if (!res.ok && res.status !== 409) {
    const body = await res.text();
    console.warn(`\n  PATCH ${id} → ${res.status}: ${body}`);
  }
}

async function run(): Promise<void> {
  const token = await getToken();

  console.log(`Emitting updates for all ${PATIENT_COUNT.toLocaleString()} ${TENANT} patients`);
  console.log(`  batch=${BATCH_SIZE}, tick=${TICK_MS}ms — press Ctrl+C to stop\n`);

  let cursor = 1;
  let totalSent = 0;

  while (true) {
    const batch: Promise<void>[] = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      const id     = `${TENANT}-p-${pad(cursor)}`;
      const status = STATUSES[Math.floor(Math.random() * STATUSES.length)] ?? 'stable';
      batch.push(patchPatient(token, id, status));
      cursor = cursor >= PATIENT_COUNT ? 1 : cursor + 1;
    }

    await Promise.allSettled(batch);
    totalSent += BATCH_SIZE;

    const pct = (cursor / PATIENT_COUNT * 100).toFixed(1);
    process.stdout.write(
      `\r  Sent ${totalSent.toLocaleString()} total | cursor ${cursor}/${PATIENT_COUNT} (${pct}%)`,
    );

    await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }
}

void run();
