import { Directory, File } from 'expo-file-system';

import type { DocumentRenderer, RenderedPage } from '../../application/ports/DocumentStore';
import { documentRenderModule as native, type DocumentRenderModule } from './documentRenderModule';
import { renderDir } from './ExpoDocumentStore';

function outFile(cacheKey: string, name: string): File {
  const dir = new Directory(renderDir(), cacheKey);
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, name);
}

function required(): DocumentRenderModule {
  if (!native) throw new Error('Document renderer unavailable');
  return native;
}

/** Renders into the app cache; an existing render of the same page and size is reused by the module. */
export const nativeDocumentRenderer: DocumentRenderer = {
  isAvailable: () => native !== null,
  async pdfPageSizes(fileUri) {
    return (await required().pdfPageSizes(fileUri)).map(([width = 1, height = 1]) => ({ width, height }));
  },
  async renderPdfPage(fileUri, cacheKey, page, widthPx): Promise<RenderedPage> {
    const out = outFile(cacheKey, `p${page}-w${widthPx}.jpg`);
    const size = await required().renderPdfPage(fileUri, page, widthPx, out.uri);
    return { uri: out.uri, ...size };
  },
  async renderImage(fileUri, cacheKey, maxPx): Promise<RenderedPage> {
    const out = outFile(cacheKey, `image-m${maxPx}.jpg`);
    const size = await required().renderImage(fileUri, maxPx, out.uri);
    return { uri: out.uri, ...size };
  },
};
