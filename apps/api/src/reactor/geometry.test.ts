import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaAndCentroidR, buildReactor, loop, RadialBuildError, rect, revolveVolume } from './geometry';
import { PRESETS } from './presets';

test('volume de révolution : un rectangle donne un cylindre creux', () => {
  const v = revolveVolume(rect(1, 2, 0, 3));
  assert.ok(Math.abs(v - Math.PI * (4 - 1) * 3) < 1e-9);
});

test('le volume plasma approche 2π²·R0·a²·κ', () => {
  const p = PRESETS[0].params;
  const model = buildReactor(p);
  const expected = 2 * Math.PI ** 2 * p.majorRadius * p.minorRadius ** 2 * p.elongation;
  assert.ok(Math.abs(model.summary.plasmaVolume - expected) / expected < 0.1);
});

test('chaque preset produit des composants valides', () => {
  for (const preset of PRESETS) {
    const model = buildReactor(preset.params);
    assert.equal(model.components.length, 15);
    for (const c of model.components) {
      assert.ok(c.volume > 0, `${preset.id}/${c.id} volume`);
      const pts = c.geometry.outer.concat(c.geometry.inner ?? []);
      for (const [r, z] of pts) {
        assert.ok(Number.isFinite(r) && Number.isFinite(z) && r >= 0, `${preset.id}/${c.id} point`);
      }
    }
  }
});

test('les couches sont emboîtées (aires croissantes)', () => {
  const p = PRESETS[0].params;
  const areas = [0, 0.2, 0.7, 1.5].map((d) => areaAndCentroidR(loop(p, d)).area);
  for (let i = 1; i < areas.length; i++) assert.ok(areas[i] > areas[i - 1]);
});

test('un empilement trop épais est refusé', () => {
  const p = { ...PRESETS[0].params, majorRadius: 3.5 };
  assert.throws(() => buildReactor(p), RadialBuildError);
});
