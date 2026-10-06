// UI test helpers around expo-router's renderRouter (RNTL 14 renders asynchronously).
import path from 'node:path';

import { renderRouter } from 'expo-router/testing-library';

export const APP_DIR = path.resolve(__dirname, '../app');

/** Renders the real route tree at `url`; awaits the async render but keeps the router helpers. */
export async function openApp(url: string) {
  const r = renderRouter(APP_DIR, { initialUrl: url });
  await r;
  return { getPathname: () => r.getPathname() };
}
