import { requireOptionalNativeModule } from 'expo';

/** Local Android module `modules/document-render` (platform PdfRenderer / ImageDecoder / ContentResolver; ADR-0013). */
export interface DocumentRenderModule {
  pdfPageSizes(fileUri: string): Promise<number[][]>;
  renderPdfPage(fileUri: string, page: number, widthPx: number, outUri: string): Promise<{ width: number; height: number }>;
  renderImage(fileUri: string, maxPx: number, outUri: string): Promise<{ width: number; height: number }>;
  contentDisplayName(contentUri: string): string | null;
}

/** Null where the module is not built in (Expo Go, iOS). */
export const documentRenderModule = requireOptionalNativeModule<DocumentRenderModule>('CashTravelDocumentRender');
