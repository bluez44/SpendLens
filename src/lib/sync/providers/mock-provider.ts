import type { CloudSyncProvider } from '../provider';
import type { Snapshot, SessionInfo, UserInfo } from '../types';

export class MockCloudSyncProvider implements CloudSyncProvider {
  signedInUser: UserInfo | null = null;
  session: SessionInfo | null = null;
  snapshot: Snapshot | null = null;
  photos = new Map<string, string>();
  failNextUpload = false;
  simulateOffline = false;

  private guardOnline(): void {
    if (this.simulateOffline) throw new Error('offline');
  }

  async signIn(): Promise<UserInfo> {
    this.guardOnline();
    this.signedInUser = {
      googleId: 'g-1', email: 'test@example.com',
      displayName: 'Test User', avatarUrl: null,
    };
    return this.signedInUser;
  }

  async signOut(): Promise<void> {
    this.signedInUser = null;
  }

  async getCurrentUser(): Promise<UserInfo | null> {
    return this.signedInUser;
  }

  async readSession(): Promise<SessionInfo | null> {
    this.guardOnline();
    return this.session;
  }

  async writeSession(session: SessionInfo): Promise<void> {
    this.guardOnline();
    this.session = session;
  }

  async downloadSnapshot(): Promise<Snapshot | null> {
    this.guardOnline();
    return this.snapshot;
  }

  async uploadSnapshot(snap: Snapshot): Promise<void> {
    this.guardOnline();
    if (this.failNextUpload) {
      this.failNextUpload = false;
      throw new Error('upload failed');
    }
    this.snapshot = snap;
  }

  async uploadPhoto(uuid: string, localPath: string): Promise<void> {
    this.guardOnline();
    this.photos.set(uuid, localPath);
  }

  async downloadPhoto(uuid: string): Promise<string> {
    this.guardOnline();
    const path = this.photos.get(uuid);
    if (!path) throw new Error(`no photo ${uuid}`);
    return path;
  }

  async listPhotos(): Promise<string[]> {
    this.guardOnline();
    return [...this.photos.keys()];
  }

  async deletePhoto(uuid: string): Promise<void> {
    this.guardOnline();
    this.photos.delete(uuid);
  }
}
