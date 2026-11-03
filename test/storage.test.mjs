import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgress, decodeRecord, STORAGE_KEY, MAX_SCORES, MAX_RECORD_LENGTH } from '../storage.mjs';

const fresh = () => ({ version: 1, scores: [], settings: { sound: false, difficulty: 'classic' } });
function memory(raw = null) {
  return { raw, reads: 0, writes: 0,
    getItem(key) { assert.equal(key, STORAGE_KEY); this.reads++; return this.raw; },
    setItem(key, value) { assert.equal(key, STORAGE_KEY); this.writes++; this.raw = value; } };
}
test('scores and settings reload as bounded, versioned records; copies cannot mutate memory', () => {
  const storage = memory();
  const progress = createProgress({ enabled: true, getStorage: () => storage });
  for (let i = 0; i < 30; i++) progress.addScore(i);
  progress.setSettings({ sound: true, difficulty: 'hard' });
  const saved = progress.read();
  assert.equal(saved.scores.length, MAX_SCORES);
  assert.deepEqual(saved.scores, [29, 28, 27, 26, 25, 24, 23, 22, 21, 20]);
  assert.equal(JSON.parse(storage.raw).version, 1);
  assert.ok(storage.raw.length <= MAX_RECORD_LENGTH);
  saved.scores.push(100); saved.settings.sound = false;
  const reloaded = createProgress({ enabled: true, getStorage: () => storage });
  assert.deepEqual(reloaded.read(), progress.read());
  assert.equal(reloaded.read().settings.sound, true);
});
test('missing, corrupt, unknown, oversized and invalid records reset safely and can be replaced', () => {
  const invalid = [null, '', '{', 'null', '[]', JSON.stringify({ ...fresh(), version: 2 }),
    JSON.stringify({ ...fresh(), scores: Array(11).fill(1) }),
    ...[-1, 1.5, '1', null, 1000001].map(score => JSON.stringify({ ...fresh(), scores: [score] })),
    JSON.stringify({ ...fresh(), settings: { sound: 'yes', difficulty: 'classic' } }),
    JSON.stringify({ ...fresh(), settings: { sound: false, difficulty: 'extreme' } }),
    JSON.stringify({ ...fresh(), settings: null }), ' '.repeat(MAX_RECORD_LENGTH + 1)];
  for (const raw of invalid) {
    const storage = memory(raw);
    const progress = createProgress({ enabled: true, getStorage: () => storage });
    assert.deepEqual(progress.read(), fresh());
    progress.addScore(0);
    assert.deepEqual(decodeRecord(storage.raw).scores, [0]);
  }
});
test('unavailable storage and throwing accessor/read/write retain working in-memory progress', () => {
  const sources = [() => undefined, () => { throw Error('blocked getter'); },
    () => ({ getItem() { throw Error('blocked read'); } }),
    () => ({ getItem() { return null; }, setItem() { throw Error('quota'); } })];
  for (const getStorage of sources) {
    const progress = createProgress({ enabled: true, getStorage });
    progress.addScore(4);
    progress.setSettings({ sound: true, difficulty: 'easy' });
    assert.deepEqual(progress.read(), { version: 1, scores: [4], settings: { sound: true, difficulty: 'easy' } });
  }
});
test('after write failure storage is not retried and existing loaded scores are retained', () => {
  let writes = 0;
  const progress = createProgress({ enabled: true, getStorage: () => ({
    getItem: () => JSON.stringify({ ...fresh(), scores: [9] }),
    setItem() { writes++; throw Error('quota'); },
  }) });
  progress.addScore(3); progress.addScore(2);
  assert.equal(writes, 1);
  assert.deepEqual(progress.read().scores, [9, 3, 2]);
});
test('disabled progress does not acquire storage, read it, or write it', () => {
  const progress = createProgress({ enabled: false, getStorage() { assert.fail('Must not acquire storage'); } });
  progress.addScore(3); progress.setSettings({ sound: true, difficulty: 'classic' });
  assert.deepEqual(progress.read().scores, [3]);
});
test('invalid updates are rejected without changing data or writing', () => {
  const storage = memory();
  const progress = createProgress({ enabled: true, getStorage: () => storage });
  for (const score of [NaN, Infinity, -1, 1.2, '2', 1000001]) assert.throws(() => progress.addScore(score), RangeError);
  for (const settings of [null, {}, { sound: 1, difficulty: 'classic' }, { sound: true, difficulty: 'unknown' }]) {
    assert.throws(() => progress.setSettings(settings), RangeError);
  }
  assert.deepEqual(progress.read(), fresh()); assert.equal(storage.writes, 0);
});
