import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

interface AppLockContextValue {
  isLocked: boolean;
  unlock: () => void;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [isLocked, setIsLocked] = useState(enabled);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!enabled) setIsLocked(false);
  }, [enabled]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (enabled && appState.current !== 'background' && next === 'background') {
        setIsLocked(true);
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [enabled]);

  const unlock = () => setIsLocked(false);

  return <AppLockContext.Provider value={{ isLocked, unlock }}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock must be used inside an AppLockProvider');
  return ctx;
}
