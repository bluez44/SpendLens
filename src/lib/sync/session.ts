import Constants from 'expo-constants';
import type { SessionInfo } from './types';

export function createSession(deviceId: string): SessionInfo {
  return {
    deviceId,
    deviceName: Constants.deviceName ?? 'Unknown device',
    loggedInAt: Date.now(),
  };
}

export function isKicked(remote: SessionInfo | null, localDeviceId: string): boolean {
  if (!remote) return false;
  return remote.deviceId !== localDeviceId;
}
