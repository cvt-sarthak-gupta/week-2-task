import type { PatientEntity } from './patient.entity';

type SortEntry = { field: string; dir: 'ASC' | 'DESC' };

export class PatientHelper {
  static parseSortString(sort: string): SortEntry[] {
    return sort.split(',').flatMap((part) => {
      const [field, dir] = part.split(':');
      if (field && (dir === 'ASC' || dir === 'DESC')) return [{ field, dir }];
      return [];
    });
  }

  static buildOrder(sort?: string): Partial<Record<keyof PatientEntity, 'ASC' | 'DESC'>> {
    if (!sort) return { updatedAt: 'DESC' };
    const parts = PatientHelper.parseSortString(sort);
    if (parts.length === 0) return { updatedAt: 'DESC' };
    return Object.fromEntries(parts.map(({ field, dir }) => [field, dir])) as Partial<Record<keyof PatientEntity, 'ASC' | 'DESC'>>;
  }

  static applySortParts<T extends Record<string, unknown>>(items: T[], sortParts: SortEntry[]): T[] {
    if (sortParts.length === 0) return items;
    return [...items].sort((a, b) => {
      for (const { field, dir } of sortParts) {
        const av = a[field];
        const bv = b[field];
        let cmp = 0;
        if (typeof av === 'string' && typeof bv === 'string') cmp = av.localeCompare(bv);
        else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        if (cmp !== 0) return dir === 'ASC' ? cmp : -cmp;
      }
      return 0;
    });
  }
}
