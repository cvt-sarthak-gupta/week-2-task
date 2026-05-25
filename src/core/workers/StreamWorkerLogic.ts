import type { DataEvent } from '../realtime/events.types';
import type { Patient } from '@/shared/types';
import type { PatientUpdate } from './protocol';

const DEDUP_CACHE_SIZE = 10_000;

export class StreamWorkerLogic {
  private readonly dedupCache: string[] = [];
  private readonly dedupSet = new Set<string>();
  private readonly entityVersions = new Map<string, number>();
  private readonly entityVitalTs = new Map<string, number>();
  private pendingBatch: PatientUpdate[] = [];

  addToDedup(id: string): boolean {
    if (this.dedupSet.has(id)) return false;
    this.dedupSet.add(id);
    this.dedupCache.push(id);
    if (this.dedupCache.length > DEDUP_CACHE_SIZE) {
      const evicted = this.dedupCache.shift()!;
      this.dedupSet.delete(evicted);
    }
    return true;
  }

  processEvent(event: DataEvent): void {
    if (!('id' in event)) return;
    if (!this.addToDedup(event.id)) return;

    if (event.type === 'vitals_updated') {
      const lastVersion = this.entityVersions.get(event.entityId) ?? -1;
      if (event.version <= lastVersion) return;
      this.entityVersions.set(event.entityId, event.version);
      this.entityVitalTs.set(event.entityId, event.ts);
      this.pendingBatch.push({
        id: event.entityId,
        patch: {
          heartRate: event.payload.heartRate,
          bp: event.payload.bp,
          temp: event.payload.temp,
          o2sat: event.payload.o2sat,
        },
        version: event.version,
      });
      return;
    }

    const lastVersion = this.entityVersions.get(event.entityId) ?? -1;
    if (event.version <= lastVersion) return;
    this.entityVersions.set(event.entityId, event.version);

    let partialPatch: Partial<Patient> = {};

    switch (event.type) {
      case 'status_changed':
        partialPatch = { status: event.payload.newStatus };
        break;
      case 'patient_updated':
        partialPatch = { ...event.payload } as Partial<Patient>;
        break;
      case 'order_changed':
      case 'alert_raised':
        break;
      default:
        break;
    }

    if (Object.keys(partialPatch).length > 0) {
      this.pendingBatch.push({
        id: event.entityId,
        patch: {
          ...partialPatch,
          updatedAt: new Date(event.ts).toISOString(),
          version: event.version,
        },
        version: event.version,
      });
    }
  }

  flushBatch(): PatientUpdate[] {
    const updates = this.pendingBatch;
    this.pendingBatch = [];
    return updates;
  }

  hasPending(): boolean {
    return this.pendingBatch.length > 0;
  }

  initVersions(patients: readonly { id: string; version: number }[]): void {
    for (const p of patients) {
      this.entityVersions.set(p.id, p.version);
    }
  }

  reset(): void {
    this.dedupCache.length = 0;
    this.dedupSet.clear();
    this.entityVersions.clear();
    this.entityVitalTs.clear();
    this.pendingBatch = [];
  }
}
