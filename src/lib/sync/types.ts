export type PhotoSyncPolicy = 'wifi' | 'always' | 'off';
export type MergeStrategy = 'local' | 'cloud' | 'combine';

export interface UserInfo {
  googleId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface SessionInfo {
  deviceId: string;
  deviceName: string;
  loggedInAt: number;
}

export interface SnapshotTxn {
  uuid: string;
  date: string;
  time: string;
  createdAt: number;
  updatedAt: number;
  category: string;
  name: string;
  note: string | null;
  amount: number;
  isIncome: 0 | 1;
  photoUuid: string | null;
}

export interface SnapshotCategory {
  id: string;
  label: string;
  createdAt: number;
  updatedAt: number;
}

export interface SnapshotSettings {
  updatedAt: number;
  values: Record<string, string>;
}

export interface Snapshot {
  version: 1;
  generatedAt: number;
  deviceId: string;
  transactions: SnapshotTxn[];
  categories: SnapshotCategory[];
  settings: SnapshotSettings;
  photoManifest: string[];
}
