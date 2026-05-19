import { useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { PatientFilters } from './patientFilters';
import type { FilterNode } from '@/features/filters/ast/types';
import { serializeUrl, deserializeUrl } from '@/features/filters/ast/url-format';

function buildRawSearch(normal: { status?: string | null; ward?: string | null; search?: string | null }, sort: string | null | undefined, filter: string | null | undefined): string {
  const p = new URLSearchParams();
  if (normal.status) p.set('status', normal.status);
  if (normal.ward) p.set('ward', normal.ward);
  if (normal.search) p.set('search', normal.search);
  const parts: string[] = [];
  const base = p.toString();
  if (base) parts.push(base);
  if (sort) sort.split('&').forEach((s) => parts.push(`sort=${s}`));
  if (filter) parts.push(`filter=${filter}`);
  return parts.join('&');
}

export function usePatientFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const status = searchParams.get('status');
  const ward = searchParams.get('ward');
  const search = searchParams.get('search');
  const sort = searchParams.getAll('sort').join('&') || null;
  const filter = searchParams.get('filter');

  // Memoized so downstream hooks (useFilterWorker) receive a stable reference
  // when the URL hasn't actually changed — prevents the new-object-every-render
  // → new useCallback → useEffect fires → setState → re-render loop.
  const filters = useMemo((): PatientFilters => {
    const f: PatientFilters = {};
    if (status) f.status = status;
    if (ward) f.ward = ward;
    if (search) f.search = search;
    if (sort) f.sort = sort;
    if (filter) f.filter = filter;
    return f;
  }, [status, ward, search, sort, filter]);

  const setFilter = useCallback(
    <K extends keyof PatientFilters>(key: K, value: PatientFilters[K]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  /**
   * Replace the entire filter expression with a FilterNode AST.
   * Serializes to the human-readable URL format and writes it WITHOUT percent-encoding
   * the structural characters ( ) : , — they are valid in query strings per RFC 3986.
   * Uses navigate() with a raw string instead of URLSearchParams to avoid the
   * application/x-www-form-urlencoded over-encoding applied by setSearchParams.
   * Pass null to clear all filters.
   */
  const setFilterAst = useCallback(
    (node: FilterNode | null) => {
      const raw = buildRawSearch({ status, ward, search }, sort, node ? serializeUrl(node) : null);
      navigate({ search: raw ? `?${raw}` : '' }, { replace: true });
    },
    [navigate, status, ward, search, sort],
  );

  /** Set the sort state without percent-encoding the field:dir:... separators. */
  const setSort = useCallback(
    (sortParam: string | undefined) => {
      const raw = buildRawSearch({ status, ward, search }, sortParam ?? null, filter);
      navigate({ search: raw ? `?${raw}` : '' }, { replace: true });
    },
    [navigate, status, ward, search, filter],
  );

  /** The current `filter` URL param parsed into a FilterNode, or null. Stable reference when filter string is unchanged. */
  const parsedFilterAst = useMemo((): FilterNode | null => {
    if (!filter) return null;
    try {
      return deserializeUrl(filter);
    } catch {
      return null;
    }
  }, [filter]);

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const hasActiveFilters = !!(filters.status || filters.ward || filters.search || filters.filter);

  return { filters, setFilter, setSort, setFilterAst, parsedFilterAst, clearFilters, hasActiveFilters };
}
