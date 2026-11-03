export const FEATURE_NAMES = Object.freeze([
  'gameplay', 'savedProgress', 'challenges', 'replay',
]);

/** Resolve a profile string or explicit boolean overrides. Unknown names are ignored. */
export function resolveFeatures(overrides = {}) {
  const all = overrides === 'all';
  const values = Object.fromEntries(FEATURE_NAMES.map(name => [name, all]));
  if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
    for (const name of FEATURE_NAMES) {
      if (Object.hasOwn(overrides, name) && typeof overrides[name] === 'boolean') {
        values[name] = overrides[name];
      }
    }
  }
  return Object.freeze(values);
}
