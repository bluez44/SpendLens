import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export function photoDirUri(): string {
  return `${Paths.document.uri}photos/`;
}

export function photoPathForUuid(uuid: string): string {
  return `${photoDirUri()}${uuid}.jpg`;
}

export function uuidFromPhotoPath(path: string | null): string | null {
  if (!path) return null;
  const dir = photoDirUri();
  if (!path.startsWith(dir)) return null;
  const name = path.slice(dir.length);
  if (!name.endsWith('.jpg')) return null;
  return name.slice(0, -'.jpg'.length);
}

function ensurePhotoDir(): void {
  const dir = new Directory(photoDirUri());
  if (!dir.exists) dir.create();
}

export async function wipeAllPhotos(): Promise<void> {
  const dir = new Directory(photoDirUri());
  if (dir.exists) dir.delete();
}

export async function migratePhotosToUuidNames(db: SQLiteDatabase): Promise<void> {
  ensurePhotoDir();
  const rows = db.getAllSync<{ id: number; photo_path: string | null }>(
    'SELECT id, photo_path FROM transactions WHERE photo_path IS NOT NULL'
  );
  for (const r of rows) {
    if (!r.photo_path || r.photo_path.startsWith('http')) continue;
    if (uuidFromPhotoPath(r.photo_path)) continue;
    const uuid = Crypto.randomUUID();
    const dest = photoPathForUuid(uuid);
    try {
      new File(r.photo_path).move(new File(dest));
      db.runSync('UPDATE transactions SET photo_path = ? WHERE id = ?', dest, r.id);
    } catch {
      // best-effort; skip broken/missing files
    }
  }
}
