import type { IRepository, QueryOptions, PaginatedResult } from '../interfaces/repository.interface';
import type { InMemoryStore } from '../../infrastructure/inMemoryStore';
import { NotFoundError } from '../errors/index';

export abstract class BaseRepository<T extends { id: string; tenantId?: string }> implements IRepository<T> {
  constructor(
    protected readonly store: InMemoryStore<T>,
    protected readonly tenantId: string,
  ) {}

  async findAll(options: QueryOptions<T> = {}): Promise<PaginatedResult<T>> {
    const { page = 1, limit = 20, where, order, search } = options;

    const orderKeys = order ? Object.keys(order) : [];
    const isDefaultSort = orderKeys.length === 1 && orderKeys[0] === 'updatedAt' && (order as Record<string, string>)['updatedAt'] === 'DESC';
    const needsFilter = !!(where || search);

    let items: T[];
    if (isDefaultSort && !needsFilter) {
      const cached = this.store.getUpdatedAtDesc(this.tenantId);
      if (cached) {
        const total = cached.length;
        const start = (page - 1) * limit;
        return { data: cached.slice(start, start + limit), total, page, limit, totalPages: Math.ceil(total / limit) };
      }
    }

    items = this.store.getAll(this.tenantId);

    if (where) {
      items = items.filter((item) =>
        Object.entries(where).every(([k, v]) => (item as Record<string, unknown>)[k] === v),
      );
    }

    if (search) {
      const term = search.term.toLowerCase();
      items = items.filter((item) =>
        search.fields.some((f) => String((item as Record<string, unknown>)[f as string] ?? '').toLowerCase().includes(term)),
      );
    }

    if (order) {
      items = [...items].sort((a, b) => {
        for (const [k, dir] of Object.entries(order)) {
          const av = (a as Record<string, unknown>)[k];
          const bv = (b as Record<string, unknown>)[k];
          let cmp = 0;
          if (typeof av === 'string' && typeof bv === 'string') cmp = av.localeCompare(bv);
          else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
          if (cmp !== 0) return dir === 'ASC' ? cmp : -cmp;
        }
        return 0;
      });
    }

    const total = items.length;
    const start = (page - 1) * limit;
    const data = items.slice(start, start + limit);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<T | null> {
    return this.store.get(this.tenantId, id);
  }

  async findOne(where: Partial<T>): Promise<T | null> {
    const items = this.store.getAll(this.tenantId);
    return items.find((item) => Object.entries(where).every(([k, v]) => (item as Record<string, unknown>)[k] === v)) ?? null;
  }

  async count(where?: Partial<T>): Promise<number> {
    if (!where) return this.store.count(this.tenantId);
    const items = this.store.getAll(this.tenantId);
    return items.filter((item) => Object.entries(where).every(([k, v]) => (item as Record<string, unknown>)[k] === v)).length;
  }

  // Accepts a complete entity (not Partial) to prevent partial-save silent data loss.
  async save(data: T): Promise<T> {
    this.store.set(this.tenantId, data);
    return data;
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    const existing = this.store.get(this.tenantId, id);
    if (!existing) throw new NotFoundError(`Record ${id} not found`);
    const updated = { ...existing, ...data } as T;
    this.store.set(this.tenantId, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const existed = this.store.delete(this.tenantId, id);
    if (!existed) throw new NotFoundError(`Record ${id} not found`);
  }
}
