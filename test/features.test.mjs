import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_NAMES, resolveFeatures } from '../features.mjs';

const disabled = { gameplay: false, savedProgress: false, challenges: false, replay: false };

const enabled = Object.fromEntries(FEATURE_NAMES.map(name => [name, true]));

test('completed capabilities default on; none explicitly disables all', () => {
  assert.deepEqual(resolveFeatures(), enabled);
  assert.deepEqual(resolveFeatures('none'), disabled);
});

test('all explicitly requests every known feature', () => {
  assert.deepEqual(resolveFeatures('all'), Object.fromEntries(FEATURE_NAMES.map(name => [name, true])));
});

test('boolean overrides are explicit and support enabled and disabled values', () => {
  for (const name of FEATURE_NAMES) {
    assert.deepEqual(resolveFeatures({ [name]: true }), { ...disabled, [name]: true });
    assert.deepEqual(resolveFeatures({ [name]: false }), disabled);
    for (const invalid of ['true', 1, null, undefined]) {
      assert.deepEqual(resolveFeatures({ [name]: invalid }), disabled);
    }
  }
});

test('unknown names and invalid profiles never enable features', () => {
  for (const input of ['unknown', 'ALL', 'gameplay', '', null, true, ['all'], { typo: true, constructor: true }]) {
    assert.deepEqual(resolveFeatures(input), disabled);
  }
  assert.deepEqual(resolveFeatures({ gameplay: true, typo: true }), { ...disabled, gameplay: true });
  assert.deepEqual(resolveFeatures(Object.create({ gameplay: true })), disabled);
});

test('results are immutable and independent of the input and other calls', () => {
  const input = { gameplay: true };
  const result = resolveFeatures(input);
  input.gameplay = false;
  assert.equal(result.gameplay, true);
  assert.throws(() => { result.gameplay = false; }, TypeError);
  assert.deepEqual(resolveFeatures(), enabled);
});

test('configured validation profile is supported', () => {
  const profile = process.env.SNAKE_FEATURES ?? 'none';
  assert.ok(['none', 'all'].includes(profile));
  assert.equal(resolveFeatures(profile).gameplay, profile === 'all');
});
