import { RuntimeEvent } from "./types.js";

type Listener = (event: RuntimeEvent<any>) => void;

export class RuntimeEventBus {
  private listeners = new Map<string, Set<Listener>>();

  public subscribe(eventType: string, listener: Listener): () => void {
    let set = this.listeners.get(eventType);
    if (!set) {
      set = new Set();
      this.listeners.set(eventType, set);
    }
    set.add(listener);

    return () => {
      set?.delete(listener);
    };
  }

  public emit<T>(eventType: string, payload: T, metadata?: Partial<RuntimeEvent>): void {
    const event: RuntimeEvent<T> = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: eventType,
      timestamp: new Date().toISOString(),
      payload,
      ...metadata,
    };

    const set = this.listeners.get(eventType);
    if (set) {
      for (const listener of set) {
        try {
          listener(event);
        } catch {
          // ignore
        }
      }
    }

    // Wildcard listeners
    const wildcardSet = this.listeners.get("*");
    if (wildcardSet) {
      for (const listener of wildcardSet) {
        try {
          listener(event);
        } catch {
          // ignore
        }
      }
    }
  }
}
