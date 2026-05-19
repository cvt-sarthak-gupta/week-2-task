import type { DataEvent, EventType } from './events.types';

type EventListener<T extends DataEvent> = (event: T) => void;

class EventBus {
  private readonly listeners = new Map<EventType, Set<EventListener<DataEvent>>>();

  subscribe<T extends DataEvent>(type: T['type'], listener: EventListener<T>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as EventListener<DataEvent>);
    return () => set!.delete(listener as EventListener<DataEvent>);
  }

  publish(event: DataEvent): void {
    const set = this.listeners.get(event.type);
    if (!set) return;
    set.forEach((cb) => cb(event));
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** Singleton shared event bus — stream worker posts to this. */
export const eventBus = new EventBus();
