import { http, HttpResponse } from 'msw';
import type { Patient } from '@/shared/types';
import { makeMockPatient } from '@/core/testing/factories';

const STATUSES = ['critical', 'stable', 'discharged', 'pending', 'admitted'] as const;
const WARDS = ['ICU', 'General', 'Cardiology', 'Pediatrics', 'Oncology'] as const;
const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Eva', 'Frank', 'Grace', 'Henry'] as const;
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'] as const;

function makeStreamPatient(i: number, tenantId: string): Patient {
  return {
    id: `ps-${i + 1}`,
    tenantId,
    mrn: 'MRN-' + String(i + 1).padStart(6, '0'),
    firstName: FIRST_NAMES[i % FIRST_NAMES.length]!,
    lastName: LAST_NAMES[i % LAST_NAMES.length]!,
    status: STATUSES[i % STATUSES.length]!,
    ward: WARDS[i % WARDS.length]!,
    age: 30 + (i % 60),
    sex: i % 2 === 0 ? 'M' : 'F',
    dob: '1970-01-01',
    assignedCoordinatorId: 'u1',
    version: 1,
    updatedAt: new Date(Date.now() - (i % 1000) * 3600000).toISOString(),
    admittedAt: new Date(Date.now() - (i % 30) * 86400000).toISOString(),
  };
}

export const handlers = [
  http.post('/api/auth/login', () =>
    HttpResponse.json({
      accessToken: 'mock.jwt.token',
      user: { id: 'u1', tenantId: 'tenant-a', email: 'coordinator@tenant-a.com', displayName: 'Test Coordinator', role: 'coordinator' },
    }),
  ),

  http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })),

  http.post('/api/auth/refresh', () =>
    HttpResponse.json({ accessToken: 'mock.jwt.refreshed' }),
  ),

  http.get('/api/me/config', () =>
    HttpResponse.json({
      version: 'v1',
      config: {
        capabilities: ['viewPatients', 'editPatientStatus', 'editPatientNotes', 'viewAlerts', 'managePresets', 'exportPatients'],
        featureFlags: {
          analyticsWidget: false,
          exportFeature: true,
          advancedFilters: true,
          offlineSupport: true,
          presetSharing: false,
        },
        layout: {
          visibleColumns: [],
          sideWidgets: [],
          actionBar: ['editStatus', 'export'],
        },
      },
    }),
  ),

  http.get('/api/patients', ({ request }) => {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const tenantId = url.searchParams.get('tenantId') ?? 'tenant-a';
    const data: Patient[] = Array.from({ length: limit }, (_, i) =>
      makeMockPatient({ id: `p-${(page - 1) * limit + i + 1}`, tenantId }),
    );
    return HttpResponse.json({ data, total: 50000, page, limit, totalPages: Math.ceil(50000 / limit) });
  }),

  http.get('/api/patients/stream', ({ request }) => {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get('tenantId') ?? 'tenant-a';
    const since = url.searchParams.get('since') ?? '0';
    void since; // acknowledged — may be used by real server for delta sync
    const TOTAL = 50000;
    const BATCH = 500;
    let generated = 0;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      pull(controller) {
        if (generated >= TOTAL) {
          controller.close();
          return;
        }
        const batchEnd = Math.min(generated + BATCH, TOTAL);
        let chunk = '';
        for (let i = generated; i < batchEnd; i++) {
          chunk += JSON.stringify(makeStreamPatient(i, tenantId)) + '\n';
        }
        controller.enqueue(encoder.encode(chunk));
        generated = batchEnd;
        if (generated >= TOTAL) {
          controller.close();
        }
      },
    });
    return new HttpResponse(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
  }),

  http.get('/api/healthz', () => new HttpResponse(null, { status: 200 })),
  http.head('/api/healthz', () => new HttpResponse(null, { status: 200 })),
];
