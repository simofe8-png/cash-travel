// In-memory receipt store/camera for tests.
import type { ReceiptCamera, ReceiptStore } from '../application/ports/ReceiptStore';

export class FakeReceiptStore implements ReceiptStore {
  files = new Map<string, { from: string; modifiedMs: number }>();
  private n = 0;
  failNextImport = false;
  constructor(public nowMs = () => Date.parse('2026-11-03T05:00:00.000Z')) {}

  async importFrom(tempUri: string): Promise<string> {
    if (this.failNextImport) {
      this.failNextImport = false;
      throw new Error('copy failed');
    }
    const name = `r-test-${++this.n}.jpg`;
    this.files.set(name, { from: tempUri, modifiedMs: this.nowMs() });
    return name;
  }
  remove(fileName: string): void {
    this.files.delete(fileName);
  }
  uriOf(fileName: string): string {
    return `file:///private/receipts/${fileName}`;
  }
  exists(fileName: string): boolean {
    return this.files.has(fileName);
  }
  listFiles() {
    return [...this.files.entries()].map(([name, f]) => ({ name, modifiedMs: f.modifiedMs }));
  }
}

export class FakeCamera implements ReceiptCamera {
  next: Awaited<ReturnType<ReceiptCamera['capture']>> = { status: 'captured', uri: 'file:///cache/photo.jpg' };
  calls = 0;
  async capture() {
    this.calls++;
    return this.next;
  }
}

/** Scriptable device authentication for tests. */
export class FakeDeviceAuth {
  available = true;
  results: ('success' | 'cancelled' | 'failed' | 'unavailable')[] = [];
  prompts: string[] = [];
  async isAvailable() {
    return this.available;
  }
  async authenticate(reason: string) {
    this.prompts.push(reason);
    return this.results.shift() ?? 'success';
  }
}

/** Captures exported report HTML instead of printing/sharing. */
export class FakePdfExporter {
  exports: { html: string; fileName: string }[] = [];
  cleanups = 0;
  async exportAndShare(html: string, fileName: string) {
    this.exports.push({ html, fileName });
    return 'shared' as const;
  }
  cleanup() {
    this.cleanups++;
  }
}
