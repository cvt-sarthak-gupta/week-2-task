export type PatientStatus = 'critical' | 'stable' | 'discharged' | 'pending' | 'admitted';
export type PatientSex = 'M' | 'F' | 'other';

export interface Patient {
  readonly id: string;
  readonly tenantId: string;
  readonly mrn: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dob: string; // ISO date
  readonly age: number;
  readonly sex: PatientSex;
  readonly status: PatientStatus;
  readonly ward: string;
  readonly assignedCoordinatorId: string;
  readonly admittedAt: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly notes?: string | undefined;
  // Live vitals — populated by vitals_updated realtime events; absent until first event
  readonly heartRate?: number | undefined;
  readonly bp?: string | undefined;
  readonly temp?: number | undefined;
  readonly o2sat?: number | undefined;
}

export interface Tenant {
  readonly id: string;
  readonly name: string;
}

export interface User {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: string; // opaque — use capabilities, not this value
}

export interface PaginatedResult<T> {
  readonly data: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface FilterPreset {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly name: string;
  readonly filterAst: string; // serialized FilterNode
  readonly isShared: boolean;
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
