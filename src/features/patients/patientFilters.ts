import type { SortState } from '@/features/virtualized-grid/core/sortState';

export interface PatientFilters {
  status?: string;
  ward?: string;
  search?: string;
  sort?: string;
  filter?: string;
}

export const PATIENT_STATUSES = ['critical', 'stable', 'admitted', 'pending', 'discharged'] as const;
export const PATIENT_WARDS = ['ICU', 'General', 'Cardiology', 'Pediatrics', 'Oncology', 'Emergency', 'Neurology'] as const;

export function sortStateToParam(state: SortState): string | undefined {
  if (state.length === 0) return undefined;
  return state.map((s) => `${s.field}:${s.dir}`).join('&');
}

export function sortParamToState(param: string | undefined): SortState {
  if (!param) return [];
  return param.split('&').flatMap((part) => {
    const [field, rawDir] = part.split(':');
    const dir = rawDir?.toLowerCase();
    if (!field || (dir !== 'asc' && dir !== 'desc')) return [];
    return [{ field, dir }];
  });
}
