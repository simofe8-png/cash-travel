import { testServices } from '../../testing/services';
import { RELOCK_AFTER_MS } from './AppLockService';

describe('App lock (device authentication)', () => {
  it('is off by default and never locks when off', () => {
    const { appLockService } = testServices();
    expect(appLockService.isEnabled()).toBe(false);
    expect(appLockService.mustLock(null)).toBe(false);
    expect(appLockService.mustLock(10 * RELOCK_AFTER_MS)).toBe(false);
  });

  it('enabling requires device authentication to succeed', async () => {
    const { appLockService, deviceAuth } = testServices();
    deviceAuth.results = ['cancelled'];
    expect(await appLockService.enable()).toBe('not_confirmed');
    expect(appLockService.isEnabled()).toBe(false);
    deviceAuth.results = ['success'];
    expect(await appLockService.enable()).toBe('enabled');
    expect(appLockService.isEnabled()).toBe(true);
  });

  it('cannot be enabled without a device screen lock / biometrics', async () => {
    const { appLockService, deviceAuth } = testServices();
    deviceAuth.available = false;
    expect(await appLockService.enable()).toBe('unavailable');
    expect(appLockService.isEnabled()).toBe(false);
  });

  it('locks at cold start and after the background threshold only', async () => {
    const { appLockService } = testServices();
    await appLockService.enable();
    expect(appLockService.mustLock(null)).toBe(true);
    expect(appLockService.mustLock(5_000)).toBe(false); // e.g. returning from the camera
    expect(appLockService.mustLock(RELOCK_AFTER_MS)).toBe(true);
  });

  it('unlock succeeds only with device authentication; failures keep it locked', async () => {
    const { appLockService, deviceAuth } = testServices();
    await appLockService.enable();
    deviceAuth.results = ['failed'];
    expect(await appLockService.unlock()).toEqual({ unlocked: false, result: 'failed' });
    deviceAuth.results = ['success'];
    expect(await appLockService.unlock()).toEqual({ unlocked: true, result: 'success' });
  });

  it('recovery: if device auth disappears, the owner is never locked out', async () => {
    const { appLockService, deviceAuth } = testServices();
    await appLockService.enable();
    deviceAuth.available = false;
    expect(await appLockService.unlock()).toEqual({ unlocked: true, result: 'unavailable' });
    expect(await appLockService.disable()).toBe(true);
    expect(appLockService.isEnabled()).toBe(false);
  });

  it('disabling requires authentication while it is available', async () => {
    const { appLockService, deviceAuth } = testServices();
    await appLockService.enable();
    deviceAuth.results = ['cancelled'];
    expect(await appLockService.disable()).toBe(false);
    expect(appLockService.isEnabled()).toBe(true);
  });
});
