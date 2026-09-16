/**
 * A tiny typed event bus.
 *
 * Modules never import each other. When `challenges` finishes a solve it
 * emits `challenge:completed` and does not know that `achievements` toasts a
 * badge or `leaderboard` refreshes - each of those subscribes on its own. A new
 * listener is a new subscriber, not an edit to the emitter (see docs/adr/0003).
 */
import { useEffect } from 'react';

export type Listener<T> = (payload: T) => void;

export interface EventBus<Events extends Record<string, unknown>> {
  emit<K extends keyof Events>(event: K, payload: Events[K]): void;
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void;
  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void;
  /** Remove every listener. Tests use it between cases. */
  clear(): void;
  /** How many listeners an event has - handy in tests and diagnostics. */
  listenerCount(event: keyof Events): number;
}

export function createTypedEventBus<Events extends Record<string, unknown>>(): EventBus<Events> {
  const listeners = new Map<keyof Events, Set<Listener<any>>>();

  const on: EventBus<Events>['on'] = (event, listener) => {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
    };
  };

  return {
    emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      // Copy: a listener may unsubscribe itself (or others) while we iterate.
      for (const listener of [...set]) {
        try {
          listener(payload);
        } catch (err) {
          // One broken subscriber must not stop the others from hearing.
          console.error(`[events] listener for "${String(event)}" threw`, err);
        }
      }
    },
    on,
    once(event, listener) {
      const off = on(event, (payload) => {
        off();
        listener(payload);
      });
      return off;
    },
    clear() {
      listeners.clear();
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0;
    }
  };
}

/** Subscribe for the lifetime of a component. */
export function useBusEvent<Events extends Record<string, unknown>, K extends keyof Events>(
  bus: EventBus<Events>,
  event: K,
  listener: Listener<Events[K]>
): void {
  useEffect(() => bus.on(event, listener), [bus, event, listener]);
}
