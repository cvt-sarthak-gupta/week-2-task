import { useEffect, useState } from 'react';

export type OfflineStatus = 'online' | 'offline' | 'syncing';

const HEALTH_CHECK_URL = '/api/healthz';
const HEALTH_CHECK_INTERVAL_MS = 30_000;

async function isReachable(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_CHECK_URL, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

type StatusListener = (status: OfflineStatus) => void;

class OfflineStatusManager {
  private _status: OfflineStatus = navigator.onLine ? 'online' : 'offline';
  private readonly listeners = new Set<StatusListener>();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  start(): void {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    this.intervalId = setInterval(() => void this.probe(), HEALTH_CHECK_INTERVAL_MS);
  }

  stop(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    if (this.intervalId !== null) clearInterval(this.intervalId);
  }

  get status(): OfflineStatus {
    return this._status;
  }

  setSyncing(): void {
    this.set('syncing');
  }

  subscribe(cb: StatusListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private handleOnline = (): void => {
    void this.probe();
  };

  private handleOffline = (): void => {
    this.set('offline');
  };

  private async probe(): Promise<void> {
    const reachable = await isReachable();
    this.set(reachable ? 'online' : 'offline');
  }

  private set(s: OfflineStatus): void {
    if (this._status === s) return;
    this._status = s;
    this.listeners.forEach((cb) => cb(s));
  }
}

export const offlineStatusManager = new OfflineStatusManager();

export function useOfflineStatus(): OfflineStatus {
  const [status, setStatus] = useState<OfflineStatus>(offlineStatusManager.status);
  useEffect(() => {
    return offlineStatusManager.subscribe(setStatus);
  }, []);
  return status;
}
