import * as Network from 'expo-network';
import type { PhotoSyncPolicy } from './types';

export async function shouldSyncPhotos(policy: PhotoSyncPolicy): Promise<boolean> {
  if (policy === 'off') return false;
  const state = await Network.getNetworkStateAsync();
  if (!state.isConnected) return false;
  if (policy === 'always') return true;
  return state.type === Network.NetworkStateType.WIFI;
}
