export const STORAGE_KEY = 'snake-arcade.progress';
export const STORAGE_VERSION = 1;
export const MAX_SCORES = 10;
export const MAX_RECORD_LENGTH = 2048;
const difficulties = ['classic', 'easy', 'hard'];
const validScore = score => Number.isSafeInteger(score) && score >= 0 && score <= 1_000_000;
const validSettings = settings => settings && typeof settings === 'object' && !Array.isArray(settings)
  && typeof settings.sound === 'boolean' && difficulties.includes(settings.difficulty);
const defaults = () => ({ version: STORAGE_VERSION, scores: [], settings: { sound: false, difficulty: 'classic' } });
const copy = record => ({ version: record.version, scores: [...record.scores], settings: { ...record.settings } });

/** Strict version boundary: invalid records are discarded as a whole. */
export function decodeRecord(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_RECORD_LENGTH) return defaults();
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== STORAGE_VERSION || !Array.isArray(value.scores)
      || value.scores.length > MAX_SCORES || !value.scores.every(validScore) || !validSettings(value.settings)) return defaults();
    return { version: STORAGE_VERSION, scores: [...value.scores].sort((a, b) => b - a),
      settings: { sound: value.settings.sound, difficulty: value.settings.difficulty } };
  } catch { return defaults(); }
}

/** Storage is acquired lazily and never touched when disabled. Failures use memory for this session. */
export function createProgress({ enabled = false, getStorage = () => globalThis.localStorage } = {}) {
  let record = defaults();
  let storage;
  if (enabled) {
    try {
      storage = getStorage();
      record = decodeRecord(storage.getItem(STORAGE_KEY));
    } catch { storage = undefined; }
  }
  const save = () => {
    if (storage) {
      try { storage.setItem(STORAGE_KEY, JSON.stringify(record)); }
      catch { storage = undefined; }
    }
    return copy(record);
  };
  return Object.freeze({
    read: () => copy(record),
    addScore(score) {
      if (!validScore(score)) throw new RangeError('Invalid score');
      record.scores = [...record.scores, score].sort((a, b) => b - a).slice(0, MAX_SCORES);
      return save();
    },
    setSettings(settings) {
      if (!validSettings(settings)) throw new RangeError('Invalid settings');
      record.settings = { sound: settings.sound, difficulty: settings.difficulty };
      return save();
    },
  });
}
