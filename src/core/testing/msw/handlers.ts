import { http, HttpResponse } from 'msw';
import type { Patient } from '@/shared/types';
import { makeMockPatient } from '../factories';

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

  http.get('/api/healthz', () => new HttpResponse(null, { status: 200 })),
];
