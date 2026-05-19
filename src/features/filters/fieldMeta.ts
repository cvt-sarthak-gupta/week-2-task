import type { PatientField } from './ast/types';
import { PATIENT_STATUSES, PATIENT_WARDS } from '@/features/patients/patientFilters';

export type FieldType = 'string' | 'number' | 'enum' | 'date';

export interface FieldMeta {
  readonly label: string;
  readonly type: FieldType;
  readonly options?: readonly string[]; // for enum fields
}

/** Filterable patient fields with UI metadata. Internal/system fields excluded. */
export const FILTERABLE_FIELDS: readonly { field: PatientField; meta: FieldMeta }[] = [
  { field: 'mrn',        meta: { label: 'MRN',           type: 'string' } },
  { field: 'firstName',  meta: { label: 'First Name',    type: 'string' } },
  { field: 'lastName',   meta: { label: 'Last Name',     type: 'string' } },
  { field: 'age',        meta: { label: 'Age',           type: 'number' } },
  { field: 'dob',        meta: { label: 'Date of Birth', type: 'date'   } },
  { field: 'sex',        meta: { label: 'Sex',           type: 'enum',   options: ['M', 'F', 'other'] } },
  { field: 'status',     meta: { label: 'Status',        type: 'enum',   options: PATIENT_STATUSES as unknown as string[] } },
  { field: 'ward',       meta: { label: 'Ward',          type: 'enum',   options: PATIENT_WARDS   as unknown as string[] } },
  { field: 'admittedAt', meta: { label: 'Admitted At',   type: 'date'   } },
  { field: 'heartRate',  meta: { label: 'Heart Rate',    type: 'number' } },
  { field: 'o2sat',      meta: { label: 'SpO2 (%)',      type: 'number' } },
  { field: 'temp',       meta: { label: 'Temperature',   type: 'number' } },
  { field: 'notes',      meta: { label: 'Notes',         type: 'string' } },
] as const;

export const FIELD_META_MAP = new Map<PatientField, FieldMeta>(
  FILTERABLE_FIELDS.map(({ field, meta }) => [field, meta]),
);

export function getFieldMeta(field: PatientField): FieldMeta {
  return FIELD_META_MAP.get(field) ?? { label: field, type: 'string' };
}
