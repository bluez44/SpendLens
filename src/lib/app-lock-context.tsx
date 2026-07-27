import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface AppLockContextValue {
  isLocked: boolean;
  unlock: () => void;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [isLocked, setIsLocked] = useState(enabled);

  useEffect(() => {
    if (!enabled) setIsLocked(false);
  }, [enabled]);

  const unlock = () => setIsLocked(false);

  return <AppLockContext.Provider value={{ isLocked, unlock }}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock must be used inside an AppLockProvider');
  return ctx;
}
