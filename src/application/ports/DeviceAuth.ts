/** Platform device authentication (biometric or device PIN/pattern/password). No app-owned secrets. */
export type DeviceAuthResult = 'success' | 'cancelled' | 'failed' | 'unavailable';

export interface DeviceAuth {
  /** True when the device has a screen lock or enrolled biometrics that can authenticate the owner. */
  isAvailable(): Promise<boolean>;
  authenticate(reason: string): Promise<DeviceAuthResult>;
}
