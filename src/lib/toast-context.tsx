import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Toast } from '@/components/sl/toast';

export const DEFAULT_TOAST_MS = 5000;

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastContextValue {
  show: (opts: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const show = useCallback((opts: ToastOptions) => {
    clearTimer();
    seqRef.current += 1;
    setToast({ ...opts, id: seqRef.current });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setToast(null);
    }, opts.durationMs ?? DEFAULT_TOAST_MS);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => ({ show, hide }), [show, hide]);

  const onAction = toast?.onAction;
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Toast
          key={toast.id}
          message={toast.message}
          actionLabel={toast.actionLabel}
          onAction={onAction ? () => { hide(); onAction(); } : undefined}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
