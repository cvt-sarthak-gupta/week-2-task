export type PatientStatus = 'critical' | 'stable' | 'discharged' | 'pending' | 'admitted';
export type PatientSex = 'M' | 'F' | 'other';

export interface PatientFilterDto {
  status?: string;
  ward?: string;
  search?: string;
  sort?: string;
  filterAst?: string;
}

export interface UpdatePatientDto {
  status?: PatientStatus;
  notes?: string;
  heartRate?: number;
  bp?: string;
  temp?: number;
  o2sat?: number;
}

export interface PatientListQuery {
  page: number;
  limit: number;
  status?: string;
  ward?: string;
  search?: string;
  sort?: string;
  filterAst?: string;
  since?: number;
}

export interface PatientUpdateBody {
  status?: PatientStatus;
  notes?: string;
  heartRate?: number;
  bp?: string;
  temp?: number;
  o2sat?: number;
  version?: number;
}
