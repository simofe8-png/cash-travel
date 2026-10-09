import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';

import type { DocumentSource, DocumentStore } from '../../application/ports/DocumentStore';

const SAFE_NAME = /^d-[a-z0-9-]+\.(pdf|jpg|png|heic)$/;
/** MIME filter offered to the system picker (the content is verified after import anyway). */
const PICKABLE = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'];

const random = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function quietDelete(e: File | Directory): void {
  try {
    if (e.exists) e.delete();
  } catch {
    // Cache entries are cleared by the OS eventually.
  }
}

/** Temporary copies of picked files (cache; removed after import and at startup). */
const importDir = () => new Directory(Paths.cache, 'doc-import');
/** Readable-named copies handed to the share sheet (cache; replaced at the next share, removed at startup). */
const shareDir = () => new Directory(Paths.cache, 'doc-share');
/** Viewer renders per document file (cache; regenerable). */
export const renderDir = () => new Directory(Paths.cache, 'doc-view');

/** "Hotel booking: Rome?" → "Hotel booking_ Rome_" — a file name any receiving app accepts. */
export function shareFileName(name: string): string {
  const clean = name.replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '_').trim();
  return clean.length > 0 && !/^\.+$/.test(clean) ? clean : 'document';
}

/** Trip documents in the app-private document directory (never shared storage). */
export class ExpoDocumentStore implements DocumentStore {
  private readonly dir = new Directory(Paths.document, 'documents');

  private file(name: string): File {
    if (!SAFE_NAME.test(name)) throw new Error('Invalid document file name');
    return new File(this.dir, name);
  }

  async readHead(sourceUri: string, n: number): Promise<Uint8Array> {
    const f = new File(sourceUri);
    const handle = f.open();
    try {
      return handle.readBytes(Math.min(n, handle.size ?? n));
    } finally {
      handle.close();
    }
  }

  sizeOf(sourceUri: string): number {
    return new File(sourceUri).size ?? 0;
  }

  availableBytes(): number | null {
    try {
      const free = Paths.availableDiskSpace;
      return Number.isFinite(free) && free > 0 ? free : null;
    } catch {
      return null;
    }
  }

  async importFrom(sourceUri: string, extension: string): Promise<string> {
    if (!this.dir.exists) this.dir.create({ intermediates: true });
    const name = `d-${random()}.${extension}`;
    const target = this.file(name);
    const source = new File(sourceUri);
    try {
      await source.copy(target);
    } catch (e) {
      quietDelete(target);
      throw e;
    }
    quietDelete(source);
    return name;
  }

  discardSource(sourceUri: string): void {
    quietDelete(new File(sourceUri));
  }

  remove(fileName: string): void {
    const f = this.file(fileName);
    if (f.exists) f.delete();
    quietDelete(new Directory(renderDir(), fileName));
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

  async share(fileName: string, shareName: string, mimeType: string): Promise<'shared' | 'sharing_unavailable'> {
    if (!(await Sharing.isAvailableAsync())) return 'sharing_unavailable';
    // Previous copies are no longer needed once a new share starts (receivers read them during the sheet).
    quietDelete(shareDir());
    const dir = new Directory(shareDir(), random());
    dir.create({ intermediates: true });
    const copy = new File(dir, shareFileName(shareName));
    await this.file(fileName).copy(copy);
    await Sharing.shareAsync(copy.uri, { mimeType, dialogTitle: 'שיתוף המסמך' });
    return 'shared';
  }

  cleanupTemporary(): void {
    quietDelete(importDir());
    quietDelete(shareDir());
    const renders = renderDir();
    if (!renders.exists) return;
    for (const e of renders.list()) {
      // Renders of documents that no longer exist.
      if (e instanceof Directory && !(SAFE_NAME.test(e.name) && new File(this.dir, e.name).exists)) quietDelete(e);
    }
  }
}

/** Not a cancellation: the picker failed (rethrown so the UI reports it). */
const isCancel = (e: unknown) => /cancel/i.test(String((e as Error)?.message ?? e));

/** System file picker (Storage Access Framework, no storage permission) and system camera. */
export const expoDocumentSource: DocumentSource = {
  async pickFile() {
    let picked: File;
    try {
      const r = await File.pickFileAsync({ mimeTypes: PICKABLE });
      if (r.canceled) return { status: 'cancelled' };
      picked = r.result;
    } catch (e) {
      if (isCancel(e)) return { status: 'cancelled' };
      throw e;
    }
    // Copy out of the provider right away: the content:// grant is temporary.
    const dir = importDir();
    if (!dir.exists) dir.create({ intermediates: true });
    const temp = new File(dir, `i-${random()}`);
    await picked.copy(temp);
    return { status: 'picked', uri: temp.uri, name: picked.name };
  },
  async capturePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { status: 'denied' };
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, exif: false, allowsEditing: false });
    if (r.canceled || !r.assets[0]) return { status: 'cancelled' };
    return { status: 'picked', uri: r.assets[0].uri, name: 'camera.jpg' };
  },
};
