import { useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { PatientFilters } from './patientFilters';
import type { FilterNode } from '@/features/filters/ast/types';
import { serializeUrl, deserializeUrl } from '@/features/filters/ast/url-format';

export function usePatientFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const status = searchParams.get('status');
  const ward   = searchParams.get('ward');
  const search = searchParams.get('search');
  const sort   = searchParams.get('sort');
  const filter = searchParams.get('filter');

  // Memoized so downstream hooks (useFilterWorker) receive a stable reference
  // when the URL hasn't actually changed — prevents the new-object-every-render
  // → new useCallback → useEffect fires → setState → re-render loop.
  const filters = useMemo((): PatientFilters => {
    const f: PatientFilters = {};
    if (status) f.status = status;
    if (ward)   f.ward   = ward;
    if (search) f.search = search;
    if (sort)   f.sort   = sort;
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
      // Keep any params unrelated to filtering (e.g. sort)
      const next = new URLSearchParams(searchParams);
      next.delete('status');
      next.delete('ward');
      next.delete('search');
      next.delete('filter');

      // Build the search string manually so the filter value is NOT percent-encoded
      const base = next.toString(); // e.g. "sort=age"
      if (node) {
        const filterPart = `filter=${serializeUrl(node)}`;
        navigate({ search: `?${base ? `${base}&` : ''}${filterPart}` }, { replace: true });
      } else {
        navigate({ search: base ? `?${base}` : '' }, { replace: true });
      }
    },
    [navigate, searchParams],
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

  return { filters, setFilter, setFilterAst, parsedFilterAst, clearFilters, hasActiveFilters };
}
