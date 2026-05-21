export interface PresetEntity {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  filterAst: string;
  isShared: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
}
