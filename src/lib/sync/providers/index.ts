import type { CloudSyncProvider } from '../provider';
import { GoogleDriveProvider } from './drive-provider';

let instance: CloudSyncProvider | null = null;

export function getCloudSyncProvider(): CloudSyncProvider {
  if (!instance) instance = new GoogleDriveProvider();
  return instance;
}

export function configureCloudSyncProvider(p: CloudSyncProvider): void {
  instance = p;
}
