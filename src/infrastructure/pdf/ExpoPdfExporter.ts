import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { PdfExporter } from '../../application/ports/PdfExporter';

const REPORT = /^CashTravel-.*\.pdf$/;

/** Deletes previously exported report PDFs from the app cache. */
function removeOldReports(): void {
  for (const e of new Directory(Paths.cache).list()) {
    if (e instanceof File && REPORT.test(e.name)) {
      try {
        e.delete();
      } catch {
        // Best effort; the OS clears the cache eventually.
      }
    }
  }
}

/**
 * A4 at 72 PPI, generated locally in the app cache. The file leaves private storage only through
 * the user's explicit share/save choice. It is kept until the next export or app start (some
 * receivers read the shared file after the sheet closes), then deleted.
 */
export const expoPdfExporter: PdfExporter = {
  async exportAndShare(html, fileName) {
    if (!(await Sharing.isAvailableAsync())) return 'sharing_unavailable';
    removeOldReports();
    // Take the PDF bytes and write the named file into our own cache directory: the printer's
    // output location is not always accessible to the file-system API (observed in Expo Go).
    const printed = await Print.printToFileAsync({ html, width: 595, height: 842, base64: true });
    try {
      new File(printed.uri).delete();
    } catch {
      // Printer cache is cleared by the OS; nothing sensitive is kept by us there.
    }
    if (!printed.base64) throw new Error('PDF rendering returned no data');
    const named = new File(Paths.cache, fileName);
    named.create({ overwrite: true });
    named.write(printed.base64, { encoding: 'base64' });
    await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', dialogTitle: 'שמירה או שיתוף של הדוח' });
    return 'shared';
  },
  cleanup: removeOldReports,
};
