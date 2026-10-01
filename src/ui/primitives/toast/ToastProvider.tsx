import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { MOTION, prefersReducedMotion } from '../../motion';

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  /** Set on dismiss while the exit animation plays; the toast is removed after it. */
  leaving?: boolean;
}

interface ToastContextType {
  toasts: Toast[];
  notify: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * App-wide notifications. Lives in ui/ so anything - the session, a module,
 * the shell - can raise a toast without knowing who renders it.
 *
 * Dismissing is two steps: the toast is marked `leaving` (Toasts renders it
 * data-state="closed", so it slides away), then dropped once that has run.
 * The four-toast cap counts live toasts only, and the one it evicts leaves
 * the same way.
 */
const MAX_LIVE = 4;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  // Ids not yet dismissed, oldest first. Kept outside state so back-to-back
  // notify() calls in one tick all see the same count.
  const liveIds = useRef<number[]>([]);

  const dismiss = useCallback((id: number) => {
    liveIds.current = liveIds.current.filter((x) => x !== id);
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      prefersReducedMotion() ? 0 : MOTION.fast
    );
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = ++nextId.current;
      liveIds.current = [...liveIds.current, id];
      setToasts((prev) => [...prev, { id, message, tone }]);
      // Keep at most four live on screen; the oldest slides away to make room.
      if (liveIds.current.length > MAX_LIVE) dismiss(liveIds.current[0]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toasts, notify, dismiss }), [toasts, notify, dismiss]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
