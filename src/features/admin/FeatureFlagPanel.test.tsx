import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { FeatureFlagPanel } from './FeatureFlagPanel';
import { PermissionProvider } from '@/core/permissions/PermissionProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PermissionSchema } from '@/core/permissions/schema';
import { server } from '@/core/testing/msw/server';

vi.mock('@/core/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/api/client')>();
  return { ...actual, setActivePermissionSchema: vi.fn() };
});

const ALL_FLAGS_ON: PermissionSchema['featureFlags'] = {
  exportFeature: true,
  advancedFilters: true,
  presetSharing: true,
};

const SCHEMA_ADMIN: PermissionSchema = {
  capabilities: ['viewPatients', 'manageFeatureFlags'],
  featureFlags: ALL_FLAGS_ON,
  layout: { visibleColumns: [], sideWidgets: [], actionBar: [] },
};

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function Wrapper({ schema = SCHEMA_ADMIN, children }: { schema?: PermissionSchema; children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeQC()}>
      <PermissionProvider schema={schema}>{children}</PermissionProvider>
    </QueryClientProvider>
  );
}

describe('FeatureFlagPanel', () => {
  it('renders all three feature flag rows when open', () => {
    render(
      <Wrapper>
        <FeatureFlagPanel userId="u1" open onClose={() => {}} />
      </Wrapper>,
    );
    expect(screen.getByText('Patient Export')).toBeInTheDocument();
    expect(screen.getByText('Advanced Filter Builder')).toBeInTheDocument();
    expect(screen.getByText('Preset Sharing')).toBeInTheDocument();
  });

  it('does not render content when closed', () => {
    render(
      <Wrapper>
        <FeatureFlagPanel userId="u1" open={false} onClose={() => {}} />
      </Wrapper>,
    );
    expect(screen.queryByText('Analytics Widget')).not.toBeInTheDocument();
  });

  it('reflects current flag state from the permission schema', () => {
    const schema: PermissionSchema = {
      ...SCHEMA_ADMIN,
      featureFlags: { ...ALL_FLAGS_ON, exportFeature: false },
    };
    render(
      <Wrapper schema={schema}>
        <FeatureFlagPanel userId="u1" open onClose={() => {}} />
      </Wrapper>,
    );
    const exportSwitch = screen.getByRole('switch', { name: /toggle patient export/i });
    const presetSwitch = screen.getByRole('switch', { name: /toggle preset sharing/i });
    expect(exportSwitch).toHaveAttribute('aria-checked', 'false');
    expect(presetSwitch).toHaveAttribute('aria-checked', 'true');
  });

  it('sends PATCH /api/admin/feature-flags when a toggle is clicked', async () => {
    let captured: Record<string, boolean> | null = null;
    server.use(
      http.patch('/api/admin/feature-flags', async ({ request }) => {
        captured = await request.json() as Record<string, boolean>;
        return HttpResponse.json({ featureFlags: { ...ALL_FLAGS_ON, ...captured } });
      }),
    );

    render(
      <Wrapper>
        <FeatureFlagPanel userId="u1" open onClose={() => {}} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByRole('switch', { name: /toggle patient export/i }));
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured).toHaveProperty('exportFeature');
  });
});
