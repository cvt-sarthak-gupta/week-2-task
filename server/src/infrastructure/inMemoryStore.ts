/** Tenant-keyed in-memory store. Replaces a DB in the mock server. */
export class InMemoryStore<T extends { id: string }> {
  private readonly data = new Map<string, Map<string, T>>();

  // Pre-sorted array for the common updatedAt-DESC query path.
  // Invalidated on any single-record mutation so callers fall back to live sort.
  private readonly updatedAtDescCache = new Map<string, T[]>();

  private getTenantMap(tenantId: string): Map<string, T> {
    let map = this.data.get(tenantId);
    if (!map) {
      map = new Map();
      this.data.set(tenantId, map);
    }
    return map;
  }

  set(tenantId: string, entity: T): void {
    this.getTenantMap(tenantId).set(entity.id, entity);
    // Invalidate cache — individual mutations discard the pre-sort
    this.updatedAtDescCache.delete(tenantId);
  }

  setMany(tenantId: string, entities: T[]): void {
    const map = this.getTenantMap(tenantId);
    for (const e of entities) map.set(e.id, e);

    // Sort ALL values currently in the map (not just the passed-in subset)
    // so the cache correctly represents the full tenant dataset.
    const sorted = Array.from(map.values()).sort((a, b) => {
      const av = (a as unknown as Record<string, string>)['updatedAt'] ?? '';
      const bv = (b as unknown as Record<string, string>)['updatedAt'] ?? '';
      return bv < av ? -1 : bv > av ? 1 : 0;
    });
    this.updatedAtDescCache.set(tenantId, sorted);
  }

  get(tenantId: string, id: string): T | null {
    return this.getTenantMap(tenantId).get(id) ?? null;
  }

  getAll(tenantId: string): T[] {
    return Array.from(this.getTenantMap(tenantId).values());
  }

  /** Returns a pre-sorted (updatedAt DESC) array if the cache is valid, otherwise null. */
  getUpdatedAtDesc(tenantId: string): T[] | null {
    return this.updatedAtDescCache.get(tenantId) ?? null;
  }

  delete(tenantId: string, id: string): boolean {
    this.updatedAtDescCache.delete(tenantId);
    return this.getTenantMap(tenantId).delete(id);
  }

  count(tenantId: string): number {
    return this.getTenantMap(tenantId).size;
  }

  clear(tenantId?: string): void {
    if (tenantId) {
      this.data.delete(tenantId);
      this.updatedAtDescCache.delete(tenantId);
    } else {
      this.data.clear();
      this.updatedAtDescCache.clear();
    }
  }
}
