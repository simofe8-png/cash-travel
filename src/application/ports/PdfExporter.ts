/** Renders report HTML to a local PDF and hands it to the OS share/save sheet. */
export interface PdfExporter {
  exportAndShare(html: string, fileName: string): Promise<'shared' | 'sharing_unavailable'>;
  /** Deletes temporary report PDFs left from earlier exports (called at startup). */
  cleanup(): void;
}
