import { BaseRepository } from '../../core/base/base.repository';
import type { PatientEntity } from './patient.entity';
import type { InMemoryStore } from '../../infrastructure/inMemoryStore';

export class PatientRepository extends BaseRepository<PatientEntity> {
  constructor(store: InMemoryStore<PatientEntity>, tenantId: string) {
    super(store, tenantId);
  }

  async findByStatus(status: string): Promise<PatientEntity[]> {
    const result = await this.findAll({ where: { status: status as PatientEntity['status'] } });
    return result.data;
  }

  async findSince(updatedSince: number): Promise<PatientEntity[]> {
    const all = this.store.getAll(this.tenantId);
    return all.filter((p) => new Date(p.updatedAt).getTime() >= updatedSince);
  }
}
