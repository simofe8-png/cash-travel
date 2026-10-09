import type { Clock } from '../application/ports/Clock';
import { expoDeviceAuth } from '../infrastructure/auth/ExpoDeviceAuth';
import { ExpoDocumentStore, expoDocumentSource } from '../infrastructure/files/ExpoDocumentStore';
import { ExpoReceiptStore, expoReceiptCamera } from '../infrastructure/files/ExpoReceiptStore';
import { nativeDocumentRenderer } from '../infrastructure/files/NativeDocumentRenderer';
import { expoPdfExporter } from '../infrastructure/pdf/ExpoPdfExporter';
import { CurrencyApiProvider } from '../infrastructure/fx/CurrencyApiProvider';
import { FrankfurterProvider } from '../infrastructure/fx/FrankfurterProvider';
import type { FetchLike } from '../infrastructure/fx/http';
import { createServices, type AppServices } from './createServices';
import { openAppDatabase } from './database';

/** Device clock: current instant and the device's current UTC offset. */
export const deviceClock: Clock = {
  now: () => new Date().toISOString(),
  offsetMinutes: () => -new Date().getTimezoneOffset(),
};

let instance: AppServices | null = null;

/** Opens the database (running migrations) and wires services once per process. */
export function getAppServices(): AppServices {
  if (!instance) {
    const { db } = openAppDatabase();
    const fetchFn = globalThis.fetch as unknown as FetchLike;
    instance = createServices(db, deviceClock, {
      fxProviders: [new FrankfurterProvider(fetchFn), new CurrencyApiProvider(fetchFn)],
      receiptStore: new ExpoReceiptStore(),
      receiptCamera: expoReceiptCamera,
      deviceAuth: expoDeviceAuth,
      pdfExporter: expoPdfExporter,
      documentStore: new ExpoDocumentStore(),
      documentSource: expoDocumentSource,
      documentRenderer: nativeDocumentRenderer,
    });
    try {
      // Bounded startup reconciliation of receipt/document files (never touches financial data).
      instance.receiptService.cleanup();
      instance.documentService.cleanup();
      expoPdfExporter.cleanup();
    } catch {
      // Non-critical; retried next start.
    }
  }
  return instance;
}
