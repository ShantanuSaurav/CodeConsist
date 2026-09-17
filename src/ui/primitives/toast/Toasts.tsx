import React from 'react';
import { useToast } from './ToastProvider';

/** Renders the toast stack. Mount once, above every route. */
export const Toasts: React.FC = () => {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
