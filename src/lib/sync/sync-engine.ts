import type { SQLiteDatabase } from 'expo-sqlite';
import type { CloudSyncProvider } from './provider';
import type { PhotoSyncPolicy, Snapshot, MergeStrategy } from './types';
import { buildSnapshot, applySnapshot } from './snapshot';
import { mergeSnapshots } from './merge';
import { createSession, isKicked } from './session';
import {
  getDirty, setDirty, setLastSyncedAt, resetSyncMeta,
} from './sync-meta';
import { syncPhotosUp, syncPhotosDown } from './photo-sync';
import { wipeAllPhotos } from './photo-paths';

export type SyncState = 'idle' | 'syncing' | 'error' | 'kicked' | 'token-expired';

export class SyncEngine {
  private state: SyncState = 'idle';
  private lastError: Error | null = null;
  private isSyncing = false;
  private listeners = new Set<(s: SyncState) => void>();

  constructor(
    private db: SQLiteDatabase,
    private provider: CloudSyncProvider,
    private deviceId: string,
    private getPolicy: () => PhotoSyncPolicy,
  ) {}

  getState(): SyncState { return this.state; }
  getLastError(): Error | null { return this.lastError; }

  onStateChange(cb: (s: SyncState) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private setState(s: SyncState): void {
    this.state = s;
    for (const cb of this.listeners) cb(s);
  }

  markDirty(): void {
    setDirty(this.db, true);
  }

  async sync(opts?: { force?: boolean }): Promise<void> {
    if (this.isSyncing) return;
    if (!opts?.force && !getDirty(this.db)) return;
    this.isSyncing = true;
    this.setState('syncing');
    try {
      const remote = await this.provider.readSession();
      if (isKicked(remote, this.deviceId)) {
        this.setState('kicked');
        return;
      }
      await this.provider.writeSession(createSession(this.deviceId));
      const snap = buildSnapshot(this.db, this.deviceId);
      await this.provider.uploadSnapshot(snap);
      await syncPhotosUp(this.provider, snap, this.getPolicy());
      setDirty(this.db, false);
      setLastSyncedAt(this.db, Date.now());
      this.setState('idle');
    } catch (err) {
      this.lastError = err instanceof Error ? err : new Error(String(err));
      this.setState('error');
    } finally {
      this.isSyncing = false;
    }
  }

  async applyFirstLoginChoice(
    local: Snapshot, remote: Snapshot, strategy: MergeStrategy,
  ): Promise<Snapshot> {
    const merged = mergeSnapshots(local, remote, strategy);
    applySnapshot(this.db, merged);
    setDirty(this.db, true);
    await this.sync({ force: true });
    await syncPhotosDown(this.provider, merged, this.getPolicy());
    return merged;
  }

  async handleKickedChoice(choice: 'keep' | 'wipe'): Promise<void> {
    await this.provider.signOut();
    resetSyncMeta(this.db);
    if (choice === 'wipe') {
      this.db.withTransactionSync(() => {
        this.db.runSync('DELETE FROM transactions');
        this.db.runSync('DELETE FROM categories');
        this.db.runSync('DELETE FROM settings');
        this.db.runSync('DELETE FROM users');
      });
      await wipeAllPhotos();
    }
    this.setState('idle');
  }
}
