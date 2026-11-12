// Loader-Shim: Die App-Dateien unter web/ sind Browser-ES-Module ohne package.json.
// Node erkennt sie zwar meist selbst als ESM, aber wir erzwingen das Format „module“
// (keine Warnungen, kein Bruch, falls später eine package.json ohne "type" dazukommt).
// App-Dateien werden NICHT verändert. Benutzung: import './esm-shim.mjs' vor dem ersten App-Import (dynamisch).
import { register } from 'node:module';

const hooks = `
export async function load(url, context, next) {
  if (url.startsWith('file:') && url.includes('/web/') && url.endsWith('.js')) {
    const r = await next(url, { ...context, format: 'module' });
    return { ...r, format: 'module' };
  }
  return next(url, context);
}`;
register('data:text/javascript,' + encodeURIComponent(hooks));
