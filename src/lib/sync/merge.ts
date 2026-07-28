import type {
  Snapshot, SnapshotTxn, SnapshotCategory, SnapshotSettings, MergeStrategy,
} from './types';

export type SourceMap = Record<string, 'local' | 'cloud' | 'merged'>;

function pickNewer<T extends { updatedAt: number }>(
  a: T, b: T, aDevice: string, bDevice: string,
): T {
  if (a.updatedAt > b.updatedAt) return a;
  if (b.updatedAt > a.updatedAt) return b;
  return aDevice < bDevice ? a : b;
}

function mergeById<T extends { updatedAt: number }>(
  local: T[], remote: T[], key: (t: T) => string,
  localDevice: string, remoteDevice: string,
): T[] {
  const byKey = new Map<string, T>();
  for (const t of local) byKey.set(key(t), t);
  for (const t of remote) {
    const existing = byKey.get(key(t));
    byKey.set(key(t), existing ? pickNewer(existing, t, localDevice, remoteDevice) : t);
  }
  return [...byKey.values()];
}

function mergeSettings(
  local: SnapshotSettings, remote: SnapshotSettings,
): SnapshotSettings {
  return local.updatedAt >= remote.updatedAt ? local : remote;
}

export function mergeSnapshots(
  local: Snapshot, remote: Snapshot, strategy: MergeStrategy,
): Snapshot {
  if (strategy === 'local') return local;
  if (strategy === 'cloud') return remote;

  return {
    version: 1,
    generatedAt: Date.now(),
    deviceId: local.deviceId,
    transactions: mergeById<SnapshotTxn>(
      local.transactions, remote.transactions,
      (t) => t.uuid, local.deviceId, remote.deviceId,
    ),
    categories: mergeById<SnapshotCategory>(
      local.categories, remote.categories,
      (c) => c.id, local.deviceId, remote.deviceId,
    ),
    settings: mergeSettings(local.settings, remote.settings),
    photoManifest: [...new Set([...local.photoManifest, ...remote.photoManifest])],
  };
}

export function computeSourceMap(
  local: Snapshot, remote: Snapshot, merged: Snapshot, strategy: MergeStrategy,
): SourceMap {
  const map: SourceMap = {};
  const localIds = new Set(local.transactions.map((t) => t.uuid));
  const remoteIds = new Set(remote.transactions.map((t) => t.uuid));
  for (const t of merged.transactions) {
    if (strategy === 'local') map[t.uuid] = 'local';
    else if (strategy === 'cloud') map[t.uuid] = 'cloud';
    else if (localIds.has(t.uuid) && remoteIds.has(t.uuid)) map[t.uuid] = 'merged';
    else if (localIds.has(t.uuid)) map[t.uuid] = 'local';
    else map[t.uuid] = 'cloud';
  }
  return map;
}
