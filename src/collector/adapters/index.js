import { RedGifsAdapter } from './redgifs.js';
import { PornhubAdapter } from './pornhub.js';
import { EpornerAdapter } from './eporner.js';

export { BaseAdapter } from './base.js';
export { RedGifsAdapter } from './redgifs.js';
export { PornhubAdapter } from './pornhub.js';
export { EpornerAdapter } from './eporner.js';

/**
 * Registry of available adapters.
 */
export const ADAPTER_REGISTRY = {
  redgifs: RedGifsAdapter,
  pornhub: PornhubAdapter,
  eporner: EpornerAdapter
};

/**
 * Create instances of enabled adapters based on config.
 * @param {string[]} [enabledNames] List of source names or comma-separated string
 * @param {Object} [options]
 * @returns {import('./base.js').BaseAdapter[]}
 */
export function createEnabledAdapters(enabledNames, options = {}) {
  let names = enabledNames;
  if (typeof names === 'string') {
    names = names.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  }
  if (!names || names.length === 0) {
    names = ['redgifs', 'pornhub', 'eporner'];
  }

  const adapters = [];
  for (const name of names) {
    const AdapterClass = ADAPTER_REGISTRY[name];
    if (AdapterClass) {
      adapters.push(new AdapterClass(options[name] || {}));
    } else {
      console.warn(`[collector] Unknown source adapter '${name}' ignored.`);
    }
  }

  return adapters;
}
