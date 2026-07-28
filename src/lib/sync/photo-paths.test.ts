jest.mock('expo-file-system', () => {
  const files: Record<string, boolean> = {};
  return {
    __esModule: true,
    Paths: { document: { uri: 'file:///doc/' } },
    File: jest.fn().mockImplementation((p: string) => ({
      exists: files[p] ?? false,
      delete: () => { delete files[p]; },
      move: (dest: { uri: string }) => {
        files[dest.uri] = true;
        delete files[p];
      },
    })),
    Directory: jest.fn().mockImplementation(() => ({
      exists: false,
      create: () => {},
      delete: () => {},
    })),
    __files: files,
  };
});

import { photoDirUri, photoPathForUuid, uuidFromPhotoPath } from './photo-paths';

describe('photo-paths', () => {
  it('photoDirUri returns document/photos/', () => {
    expect(photoDirUri()).toBe('file:///doc/photos/');
  });

  it('photoPathForUuid appends uuid.jpg', () => {
    expect(photoPathForUuid('abc-123')).toBe('file:///doc/photos/abc-123.jpg');
  });

  it('uuidFromPhotoPath extracts uuid from a photo path', () => {
    expect(uuidFromPhotoPath('file:///doc/photos/abc-123.jpg')).toBe('abc-123');
  });

  it('uuidFromPhotoPath returns null for non-photo paths', () => {
    expect(uuidFromPhotoPath(null)).toBeNull();
    expect(uuidFromPhotoPath('https://example.com/x.jpg')).toBeNull();
  });
});
