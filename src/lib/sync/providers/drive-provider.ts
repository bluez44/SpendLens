import { File } from 'expo-file-system';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import type { CloudSyncProvider } from '../provider';
import type { Snapshot, SessionInfo, UserInfo } from '../types';
import { photoPathForUuid } from '../photo-paths';

const SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];
const SNAPSHOT_NAME = 'spendlens-snapshot.json';
const SESSION_NAME = 'session.json';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  GoogleSignin.configure({ scopes: SCOPES, offlineAccess: false });
  configured = true;
}

async function authHeader(): Promise<Record<string, string>> {
  ensureConfigured();
  const { accessToken } = await GoogleSignin.getTokens();
  return { Authorization: `Bearer ${accessToken}` };
}

async function findFileId(name: string): Promise<string | null> {
  const headers = await authHeader();
  const q = encodeURIComponent(`name='${name}' and 'appDataFolder' in parents and trashed=false`);
  const res = await fetch(
    `${DRIVE_API}/files?spaces=appDataFolder&q=${q}&fields=files(id,name)`,
    { headers },
  );
  if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
  const body = (await res.json()) as { files: { id: string; name: string }[] };
  return body.files[0]?.id ?? null;
}

async function downloadJson<T>(fileId: string): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers });
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function uploadJson(name: string, existingId: string | null, data: unknown): Promise<void> {
  const headers = await authHeader();
  const boundary = '----spendlens' + Date.now();
  const metadata: Record<string, unknown> = { name };
  if (!existingId) metadata.parents = ['appDataFolder'];

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) + `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    JSON.stringify(data) + `\r\n` +
    `--${boundary}--`;

  const url = existingId
    ? `${DRIVE_UPLOAD}/files/${existingId}?uploadType=multipart`
    : `${DRIVE_UPLOAD}/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`);
}

export class GoogleDriveProvider implements CloudSyncProvider {
  async signIn(): Promise<UserInfo> {
    ensureConfigured();
    await GoogleSignin.hasPlayServices();
    const res = await GoogleSignin.signIn();
    if (res.type !== 'success') throw new Error('sign-in cancelled');
    const u = res.data.user;
    return {
      googleId: u.id,
      email: u.email,
      displayName: u.name ?? null,
      avatarUrl: u.photo ?? null,
    };
  }

  async signOut(): Promise<void> {
    ensureConfigured();
    await GoogleSignin.signOut();
  }

  async getCurrentUser(): Promise<UserInfo | null> {
    ensureConfigured();
    const cur = GoogleSignin.getCurrentUser();
    if (!cur) return null;
    return {
      googleId: cur.user.id,
      email: cur.user.email,
      displayName: cur.user.name ?? null,
      avatarUrl: cur.user.photo ?? null,
    };
  }

  async readSession(): Promise<SessionInfo | null> {
    const id = await findFileId(SESSION_NAME);
    if (!id) return null;
    return downloadJson<SessionInfo>(id);
  }

  async writeSession(session: SessionInfo): Promise<void> {
    const id = await findFileId(SESSION_NAME);
    await uploadJson(SESSION_NAME, id, session);
  }

  async downloadSnapshot(): Promise<Snapshot | null> {
    const id = await findFileId(SNAPSHOT_NAME);
    if (!id) return null;
    return downloadJson<Snapshot>(id);
  }

  async uploadSnapshot(snap: Snapshot): Promise<void> {
    const id = await findFileId(SNAPSHOT_NAME);
    await uploadJson(SNAPSHOT_NAME, id, snap);
  }

  async listPhotos(): Promise<string[]> {
    const headers = await authHeader();
    const q = encodeURIComponent(`'appDataFolder' in parents and mimeType='image/jpeg' and trashed=false`);
    const res = await fetch(
      `${DRIVE_API}/files?spaces=appDataFolder&q=${q}&fields=files(name)`,
      { headers },
    );
    if (!res.ok) throw new Error(`Drive list photos failed: ${res.status}`);
    const body = (await res.json()) as { files: { name: string }[] };
    return body.files
      .map((f) => f.name)
      .filter((n) => n.endsWith('.jpg'))
      .map((n) => n.slice(0, -'.jpg'.length));
  }

  async uploadPhoto(uuid: string, localPath: string): Promise<void> {
    const headers = await authHeader();
    const name = `${uuid}.jpg`;
    const existing = await findFileId(name);
    const boundary = '----spendlens-photo-' + Date.now();
    const metadata: Record<string, unknown> = { name };
    if (!existing) metadata.parents = ['appDataFolder'];

    const bytes = new File(localPath).bytes();
    const b64 = bytes ? btoa(String.fromCharCode(...new Uint8Array(bytes))) : '';

    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) + `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: image/jpeg\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      b64 + `\r\n` +
      `--${boundary}--`;

    const url = existing
      ? `${DRIVE_UPLOAD}/files/${existing}?uploadType=multipart`
      : `${DRIVE_UPLOAD}/files?uploadType=multipart`;

    const res = await fetch(url, {
      method: existing ? 'PATCH' : 'POST',
      headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!res.ok) throw new Error(`Drive upload photo failed: ${res.status}`);
  }

  async downloadPhoto(uuid: string): Promise<string> {
    const headers = await authHeader();
    const fileId = await findFileId(`${uuid}.jpg`);
    if (!fileId) throw new Error(`photo ${uuid} not found`);
    const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers });
    if (!res.ok) throw new Error(`Drive download photo failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    const dest = photoPathForUuid(uuid);
    new File(dest).write(new Uint8Array(buf));
    return dest;
  }

  async deletePhoto(uuid: string): Promise<void> {
    const headers = await authHeader();
    const fileId = await findFileId(`${uuid}.jpg`);
    if (!fileId) return;
    const res = await fetch(`${DRIVE_API}/files/${fileId}`, { method: 'DELETE', headers });
    if (!res.ok && res.status !== 404) throw new Error(`Drive delete failed: ${res.status}`);
  }
}
