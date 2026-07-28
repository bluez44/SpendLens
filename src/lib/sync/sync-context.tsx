import {
  createContext, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { db as defaultDb } from '../db';
import { useSettings } from '../settings-context';
import { getOrCreateDeviceId } from './device-id';
import { getCloudSyncProvider } from './providers';
import { SyncEngine, type SyncState } from './sync-engine';
import { getLastSyncedAt, resetSyncMeta } from './sync-meta';
import { buildSnapshot, isEmptySnapshot } from './snapshot';
import { wipeAllPhotos } from './photo-paths';
import type { MergeStrategy, PhotoSyncPolicy, Snapshot, UserInfo } from './types';

const PERIODIC_MS = 15 * 60 * 1000;
const DEBOUNCE_MS = 4000;

interface PendingFirstLogin {
  local: Snapshot;
  remote: Snapshot;
}

interface SyncCtx {
  state: SyncState;
  lastError: Error | null;
  user: UserInfo | null;
  lastSyncedAt: number | null;
  pendingFirstLogin: PendingFirstLogin | null;
  pendingKicked: boolean;
  signIn: () => Promise<void>;
  signOut: (opts?: { wipe?: boolean }) => Promise<void>;
  syncNow: () => Promise<void>;
  markDirty: () => void;
  applyFirstLoginChoice: (s: MergeStrategy) => Promise<void>;
  handleKickedChoice: (c: 'keep' | 'wipe') => Promise<void>;
}

const Ctx = createContext<SyncCtx | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const policy: PhotoSyncPolicy =
    (settings as { photoSyncPolicy?: PhotoSyncPolicy }).photoSyncPolicy ?? 'wifi';

  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [state, setState] = useState<SyncState>('idle');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => {
    try { return getLastSyncedAt(defaultDb); } catch { return null; }
  });
  const [pendingFirstLogin, setPendingFirstLogin] = useState<PendingFirstLogin | null>(null);
  const [pendingKicked, setPendingKicked] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const policyRef = useRef(policy);
  policyRef.current = policy;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const deviceId = await getOrCreateDeviceId();
        if (cancelled) return;
        const provider = getCloudSyncProvider();
        const e = new SyncEngine(defaultDb, provider, deviceId, () => policyRef.current);
        const u = await provider.getCurrentUser().catch(() => null);
        if (cancelled) return;
        setUser(u);
        setEngine(e);
      } catch (err) {
        console.warn('Sync init failed; running without cloud sync', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!engine) return;
    const off = engine.onStateChange((s) => {
      setState(s);
      if (s === 'idle') setLastSyncedAt(getLastSyncedAt(defaultDb));
      if (s === 'kicked') setPendingKicked(true);
    });
    return off;
  }, [engine]);

  useEffect(() => {
    if (!engine || !user) return;
    engine.sync().catch(() => {});
    const id = setInterval(() => engine.sync().catch(() => {}), PERIODIC_MS);
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') engine.sync().catch(() => {});
    });
    return () => { clearInterval(id); sub.remove(); };
  }, [engine, user]);

  const value = useMemo<SyncCtx | null>(() => {
    if (!engine) return null;
    return {
      state,
      lastError: engine.getLastError(),
      user,
      lastSyncedAt,
      pendingFirstLogin,
      pendingKicked,

      signIn: async () => {
        const provider = getCloudSyncProvider();
        const u = await provider.signIn();
        setUser(u);
        const remote = await provider.downloadSnapshot();
        const deviceId = await getOrCreateDeviceId();
        const local = buildSnapshot(defaultDb, deviceId);
        const localEmpty = local.transactions.length === 0 && local.categories.length === 0;
        const remoteEmpty = isEmptySnapshot(remote);
        if (localEmpty && remoteEmpty) {
          engine.markDirty();
          await engine.sync({ force: true });
        } else if (!localEmpty && remoteEmpty) {
          engine.markDirty();
          await engine.sync({ force: true });
        } else if (localEmpty && remote) {
          await engine.applyFirstLoginChoice(local, remote, 'cloud');
        } else if (remote) {
          setPendingFirstLogin({ local, remote });
        }
      },

      signOut: async (opts) => {
        const provider = getCloudSyncProvider();
        await provider.signOut();
        setUser(null);
        resetSyncMeta(defaultDb);
        if (opts?.wipe) {
          defaultDb.withTransactionSync(() => {
            defaultDb.runSync('DELETE FROM transactions');
            defaultDb.runSync('DELETE FROM categories');
            defaultDb.runSync('DELETE FROM settings');
            defaultDb.runSync('DELETE FROM users');
          });
          await wipeAllPhotos();
        }
      },

      syncNow: async () => { await engine.sync({ force: true }); },

      markDirty: () => {
        engine.markDirty();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => engine.sync().catch(() => {}), DEBOUNCE_MS);
      },

      applyFirstLoginChoice: async (strategy) => {
        if (!pendingFirstLogin) return;
        await engine.applyFirstLoginChoice(pendingFirstLogin.local, pendingFirstLogin.remote, strategy);
        setPendingFirstLogin(null);
      },

      handleKickedChoice: async (choice) => {
        await engine.handleKickedChoice(choice);
        setUser(null);
        setPendingKicked(false);
      },
    };
  }, [engine, state, user, lastSyncedAt, pendingFirstLogin, pendingKicked]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync(): SyncCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSync must be used inside <SyncProvider>');
  return v;
}

export function useMaybeSync(): SyncCtx | null {
  return useContext(Ctx);
}
