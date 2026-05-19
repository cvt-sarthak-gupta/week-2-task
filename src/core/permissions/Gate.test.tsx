import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Gate } from './Gate';
import { PermissionProvider } from './PermissionProvider';
import type { PermissionSchema } from './schema';

const makeSchema = (caps: PermissionSchema['capabilities']): PermissionSchema => ({
  capabilities: caps,
  featureFlags: {
    analyticsWidget: true,
    exportFeature: true,
    advancedFilters: true,
    offlineSupport: true,
    presetSharing: true,
  },
  layout: { visibleColumns: [], sideWidgets: [], actionBar: [] },
});

function renderWithSchema(caps: PermissionSchema['capabilities'], jsx: React.ReactElement) {
  return render(
    <PermissionProvider schema={makeSchema(caps)}>{jsx}</PermissionProvider>,
  );
}

describe('Gate component', () => {
  it('renders children when user has the capability', () => {
    renderWithSchema(['exportPatients'], (
      <Gate cap="exportPatients">
        <button>Export</button>
      </Gate>
    ));
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('does NOT render children when user lacks the capability', () => {
    renderWithSchema([], (
      <Gate cap="exportPatients">
        <button>Export</button>
      </Gate>
    ));
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
  });

  it('renders fallback when unauthorized', () => {
    renderWithSchema([], (
      <Gate cap="exportPatients" fallback={<span>Access denied</span>}>
        <button>Export</button>
      </Gate>
    ));
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
  });

  it('child tree is NOT in the DOM when unauthorized (not just hidden)', () => {
    const { container } = renderWithSchema([], (
      <Gate cap="editPatientStatus">
        <div data-testid="secret-panel">Secret</div>
      </Gate>
    ));
    // Must not be in DOM at all — not display:none
    expect(container.querySelector('[data-testid="secret-panel"]')).toBeNull();
  });

  it('renders correctly when capability requires a feature flag (both present)', () => {
    renderWithSchema(['exportPatients'], (
      <Gate cap="exportPatients">
        <button>Export</button>
      </Gate>
    ));
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });
});
