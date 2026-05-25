export class InMemoryStore<T extends { id: string }> {
  private readonly data = new Map<string, Map<string, T>>();

  private readonly sortedCache = new Map<string, T[]>();
  private readonly dirtyTenants = new Set<string>();

  private getTenantMap(tenantId: string): Map<string, T> {
    let map = this.data.get(tenantId);
    if (!map) {
      map = new Map();
      this.data.set(tenantId, map);
    }
    return map;
  }

  private buildSortedCache(tenantId: string): T[] {
    const sorted = Array.from(this.getTenantMap(tenantId).values()).sort((a, b) => {
      const av = (a as unknown as Record<string, string>)['updatedAt'] ?? '';
      const bv = (b as unknown as Record<string, string>)['updatedAt'] ?? '';
      return bv < av ? -1 : bv > av ? 1 : 0;
    });
    this.sortedCache.set(tenantId, sorted);
    this.dirtyTenants.delete(tenantId);
    return sorted;
  }

  set(tenantId: string, entity: T): void {
    this.getTenantMap(tenantId).set(entity.id, entity);
    this.dirtyTenants.add(tenantId);
  }

  setMany(tenantId: string, entities: T[]): void {
    const map = this.getTenantMap(tenantId);
    for (const e of entities) map.set(e.id, e);
    this.dirtyTenants.add(tenantId);
  }

  get(tenantId: string, id: string): T | null {
    return this.getTenantMap(tenantId).get(id) ?? null;
  }

  getAll(tenantId: string): T[] {
    return Array.from(this.getTenantMap(tenantId).values());
  }

  getUpdatedAtDesc(tenantId: string): T[] | null {
    if (!this.data.has(tenantId)) return null;
    if (this.dirtyTenants.has(tenantId)) return this.buildSortedCache(tenantId);
    return this.sortedCache.get(tenantId) ?? this.buildSortedCache(tenantId);
  }

  delete(tenantId: string, id: string): boolean {
    const deleted = this.getTenantMap(tenantId).delete(id);
    if (deleted) this.dirtyTenants.add(tenantId);
    return deleted;
  }

  count(tenantId: string): number {
    return this.getTenantMap(tenantId).size;
  }

  clear(tenantId?: string): void {
    if (tenantId) {
      this.data.delete(tenantId);
      this.sortedCache.delete(tenantId);
      this.dirtyTenants.delete(tenantId);
    } else {
      this.data.clear();
      this.sortedCache.clear();
      this.dirtyTenants.clear();
    }
  }
}
