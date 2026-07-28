import type { CloudSyncProvider } from '../provider';

let instance: CloudSyncProvider | null = null;

export function getCloudSyncProvider(): CloudSyncProvider {
  if (!instance) {
    const { GoogleDriveProvider } = require('./drive-provider') as typeof import('./drive-provider');
    instance = new GoogleDriveProvider();
  }
  return instance;
}

export function configureCloudSyncProvider(p: CloudSyncProvider): void {
  instance = p;
}
