export type PatientStatus = 'critical' | 'stable' | 'discharged' | 'pending' | 'admitted';

export interface PatientEntity {
  id: string;
  tenantId: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dob: string;
  age: number;
  sex: 'M' | 'F' | 'other';
  status: PatientStatus;
  ward: string;
  assignedCoordinatorId: string;
  admittedAt: string;
  updatedAt: string;
  version: number;
  notes?: string;
  heartRate?: number;
  bp?: string;
  temp?: number;
  o2sat?: number;
}
