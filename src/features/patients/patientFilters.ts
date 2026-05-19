import type { SortState } from '@/features/virtualized-grid/core/sortState';

export interface PatientFilters {
  status?: string;
  ward?: string;
  search?: string;
  sort?: string;      // wire format: "field:ASC,field2:DESC"
  filter?: string; // human-readable URL filter — takes precedence when present
}

export const PATIENT_STATUSES = ['critical', 'stable', 'admitted', 'pending', 'discharged'] as const;
export const PATIENT_WARDS = ['ICU', 'General', 'Cardiology', 'Pediatrics', 'Oncology', 'Emergency', 'Neurology'] as const;

export function sortStateToParam(state: SortState): string | undefined {
  if (state.length === 0) return undefined;
  return state.map((s) => `${s.field}:${s.dir.toUpperCase()}`).join(',');
}

export function sortParamToState(param: string | undefined): SortState {
  if (!param) return [];
  return param.split(',').flatMap((part) => {
    const [field, dir] = part.split(':');
    if (!field || (dir !== 'ASC' && dir !== 'DESC')) return [];
    return [{ field, dir: dir.toLowerCase() as 'asc' | 'desc' }];
  });
}
