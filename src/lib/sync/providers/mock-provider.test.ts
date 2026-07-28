import { MockCloudSyncProvider } from './mock-provider';
import type { Snapshot } from '../types';

const emptySnap: Snapshot = {
  version: 1, generatedAt: 0, deviceId: 'x',
  transactions: [], categories: [],
  settings: { updatedAt: 0, values: {} }, photoManifest: [],
};

describe('MockCloudSyncProvider', () => {
  it('starts signed out', async () => {
    const p = new MockCloudSyncProvider();
    expect(await p.getCurrentUser()).toBeNull();
  });
  it('signIn returns a user and getCurrentUser reflects it', async () => {
    const p = new MockCloudSyncProvider();
    const u = await p.signIn();
    expect(u.email).toBeTruthy();
    expect(await p.getCurrentUser()).toEqual(u);
  });
  it('uploadSnapshot / downloadSnapshot roundtrips', async () => {
    const p = new MockCloudSyncProvider();
    await p.uploadSnapshot(emptySnap);
    expect(await p.downloadSnapshot()).toEqual(emptySnap);
  });
  it('downloadSnapshot returns null when nothing was uploaded', async () => {
    expect(await new MockCloudSyncProvider().downloadSnapshot()).toBeNull();
  });
  it('failNextUpload rejects the next upload only', async () => {
    const p = new MockCloudSyncProvider();
    p.failNextUpload = true;
    await expect(p.uploadSnapshot(emptySnap)).rejects.toThrow();
    await expect(p.uploadSnapshot(emptySnap)).resolves.toBeUndefined();
  });
  it('simulateOffline rejects every network call', async () => {
    const p = new MockCloudSyncProvider();
    p.simulateOffline = true;
    await expect(p.downloadSnapshot()).rejects.toThrow(/offline/i);
  });
  it('uploadPhoto / listPhotos / deletePhoto', async () => {
    const p = new MockCloudSyncProvider();
    await p.uploadPhoto('u1', '/tmp/a.jpg');
    await p.uploadPhoto('u2', '/tmp/b.jpg');
    expect((await p.listPhotos()).sort()).toEqual(['u1', 'u2']);
    await p.deletePhoto('u1');
    expect(await p.listPhotos()).toEqual(['u2']);
  });
});
