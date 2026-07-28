import type { Snapshot, SessionInfo, UserInfo } from './types';

export interface CloudSyncProvider {
  signIn(): Promise<UserInfo>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<UserInfo | null>;

  readSession(): Promise<SessionInfo | null>;
  writeSession(session: SessionInfo): Promise<void>;

  downloadSnapshot(): Promise<Snapshot | null>;
  uploadSnapshot(snap: Snapshot): Promise<void>;

  uploadPhoto(uuid: string, localPath: string): Promise<void>;
  downloadPhoto(uuid: string): Promise<string>;
  listPhotos(): Promise<string[]>;
  deletePhoto(uuid: string): Promise<void>;
}
