import type { CloudSyncProvider } from './provider';
import type { UserInfo } from './types';

export async function signIn(provider: CloudSyncProvider): Promise<UserInfo> {
  return provider.signIn();
}

export async function signOut(provider: CloudSyncProvider): Promise<void> {
  await provider.signOut();
}
