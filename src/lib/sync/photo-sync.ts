import { File } from 'expo-file-system';
import type { CloudSyncProvider } from './provider';
import type { PhotoSyncPolicy, Snapshot } from './types';
import { shouldSyncPhotos } from './network-policy';
import { photoPathForUuid } from './photo-paths';

export async function syncPhotosUp(
  provider: CloudSyncProvider, snap: Snapshot, policy: PhotoSyncPolicy,
): Promise<void> {
  if (!(await shouldSyncPhotos(policy))) return;
  const cloudUuids = new Set(await provider.listPhotos());
  for (const uuid of snap.photoManifest) {
    if (cloudUuids.has(uuid)) continue;
    const local = photoPathForUuid(uuid);
    if (!new File(local).exists) continue;
    try {
      await provider.uploadPhoto(uuid, local);
    } catch {
      // skip; next sync retries
    }
  }
}

export async function syncPhotosDown(
  provider: CloudSyncProvider, snap: Snapshot, policy: PhotoSyncPolicy,
): Promise<void> {
  if (!(await shouldSyncPhotos(policy))) return;
  for (const uuid of snap.photoManifest) {
    if (new File(photoPathForUuid(uuid)).exists) continue;
    try {
      await provider.downloadPhoto(uuid);
    } catch {
      // placeholder shown; next sync retries
    }
  }
}
