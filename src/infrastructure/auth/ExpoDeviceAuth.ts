import * as LocalAuthentication from 'expo-local-authentication';

import type { DeviceAuth, DeviceAuthResult } from '../../application/ports/DeviceAuth';

/** Biometrics with fallback to the device PIN/pattern/password (platform-managed). */
export const expoDeviceAuth: DeviceAuth = {
  async isAvailable() {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  },
  async authenticate(reason: string): Promise<DeviceAuthResult> {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: 'ביטול', disableDeviceFallback: false });
    if (r.success) return 'success';
    if (r.error === 'user_cancel' || r.error === 'system_cancel' || r.error === 'app_cancel') return 'cancelled';
    if (r.error === 'not_enrolled' || r.error === 'not_available' || r.error === 'passcode_not_set') return 'unavailable';
    return 'failed';
  },
};
