const mockLocalFiles = new Set<string>();
jest.mock('expo-file-system', () => ({
  __esModule: true,
  Paths: { document: { uri: 'file:///doc/' } },
  File: jest.fn().mockImplementation((p: string) => ({
    exists: mockLocalFiles.has(p),
  })),
  Directory: jest.fn(),
}));
jest.mock('./network-policy', () => ({
  __esModule: true,
  shouldSyncPhotos: jest.fn(async () => true),
}));

import { syncPhotosUp, syncPhotosDown } from './photo-sync';
import { MockCloudSyncProvider } from './providers/mock-provider';
import type { Snapshot } from './types';

function snap(photoUuids: string[]): Snapshot {
  return {
    version: 1, generatedAt: 0, deviceId: 'x',
    transactions: photoUuids.map((u) => ({
      uuid: `t-${u}`, date: '', time: '', createdAt: 0, updatedAt: 0,
      category: 'food', name: 'x', note: null, amount: 1, isIncome: 0,
      photoUuid: u,
    })),
    categories: [], settings: { updatedAt: 0, values: {} },
    photoManifest: photoUuids,
  };
}

describe('syncPhotosUp', () => {
  beforeEach(() => mockLocalFiles.clear());

  it('uploads only photos missing from the cloud', async () => {
    mockLocalFiles.add('file:///doc/photos/a.jpg');
    mockLocalFiles.add('file:///doc/photos/b.jpg');
    const p = new MockCloudSyncProvider();
    await p.uploadPhoto('a', '/x');
    await syncPhotosUp(p, snap(['a', 'b']), 'always');
    expect((await p.listPhotos()).sort()).toEqual(['a', 'b']);
  });

  it('respects policy=off', async () => {
    const { shouldSyncPhotos } = require('./network-policy');
    (shouldSyncPhotos as jest.Mock).mockResolvedValueOnce(false);
    const p = new MockCloudSyncProvider();
    mockLocalFiles.add('file:///doc/photos/a.jpg');
    await syncPhotosUp(p, snap(['a']), 'off');
    expect(await p.listPhotos()).toEqual([]);
  });
});

describe('syncPhotosDown', () => {
  beforeEach(() => mockLocalFiles.clear());

  it('downloads only photos missing locally', async () => {
    const p = new MockCloudSyncProvider();
    await p.uploadPhoto('a', '/tmp/a.jpg');
    await p.uploadPhoto('b', '/tmp/b.jpg');
    mockLocalFiles.add('file:///doc/photos/a.jpg');
    const downloaded: string[] = [];
    p.downloadPhoto = jest.fn(async (u: string) => {
      downloaded.push(u);
      return `file:///doc/photos/${u}.jpg`;
    });
    await syncPhotosDown(p, snap(['a', 'b']), 'always');
    expect(downloaded).toEqual(['b']);
  });
});
