import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import type { ReceiptCamera, ReceiptStore } from '../../application/ports/ReceiptStore';

const SAFE_NAME = /^r-[a-z0-9-]+\.jpg$/;

/** Receipt photos in the app-private document directory (never shared storage). */
export class ExpoReceiptStore implements ReceiptStore {
  private readonly dir = new Directory(Paths.document, 'receipts');

  private ensureDir(): void {
    if (!this.dir.exists) this.dir.create({ intermediates: true });
  }

  private file(name: string): File {
    if (!SAFE_NAME.test(name)) throw new Error('Invalid receipt file name');
    return new File(this.dir, name);
  }

  async importFrom(tempUri: string): Promise<string> {
    this.ensureDir();
    const name = `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.jpg`;
    const source = new File(tempUri);
    await source.copy(this.file(name));
    try {
      // The camera's temporary copy lives in the cache; remove it once safely copied.
      source.delete();
    } catch {
      // Cache files are cleaned by the OS anyway.
    }
    return name;
  }

  remove(fileName: string): void {
    const f = this.file(fileName);
    if (f.exists) f.delete();
  }

  uriOf(fileName: string): string {
    return this.file(fileName).uri;
  }

  exists(fileName: string): boolean {
    return SAFE_NAME.test(fileName) && this.file(fileName).exists;
  }

  listFiles(): { name: string; modifiedMs: number | null }[] {
    if (!this.dir.exists) return [];
    return this.dir
      .list()
      .filter((e): e is File => e instanceof File && SAFE_NAME.test(e.name))
      .map((f) => ({ name: f.name, modifiedMs: Number.isFinite(f.lastModified) ? f.lastModified : null }));
  }
}

/** System camera via expo-image-picker; asks for the camera permission only when invoked. */
export const expoReceiptCamera: ReceiptCamera = {
  async capture() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { status: 'denied' };
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, exif: false, allowsEditing: false });
    if (r.canceled || !r.assets[0]) return { status: 'cancelled' };
    return { status: 'captured', uri: r.assets[0].uri };
  },
};
