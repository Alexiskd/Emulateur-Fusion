import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRESETS } from '../reactor/presets';
import { evaluatePlant, MAX_DIVERTOR_LOAD, MAX_WALL_LOAD, maxElongation, optimizePlant, requiredCoilThickness, MAGNETS } from './plant';
import type { Objective, PlantInput } from './plant.types';

const input = (i: number): PlantInput => {
  const p = PRESETS[i];
  return { params: p.params, power: p.power, design: p.transfer, magnet: p.magnet };
};

test('la machine type ITER retrouve les grandeurs connues du vrai ITER', () => {
  const { plasma } = evaluatePlant(input(0));
  assert.ok(plasma.fieldOnAxis > 5.1 && plasma.fieldOnAxis < 5.5, `champ ${plasma.fieldOnAxis}`); // 5,3 T
  assert.ok(plasma.current > 14 && plasma.current < 16, `courant ${plasma.current}`); // 15 MA
  assert.ok(plasma.density > 0.9 && plasma.density < 1.15, `densité ${plasma.density}`); // 1,0·10²⁰ m⁻³
  assert.ok(plasma.fusionPower > 400 && plasma.fusionPower < 600, `fusion ${plasma.fusionPower}`); // 500 MW
  assert.ok(plasma.gain > 6 && plasma.gain < 12, `gain ${plasma.gain}`); // Q = 10
});

test("l'épaisseur de bobine calculée donne exactement le champ maximal du conducteur", () => {
  const params = PRESETS[0].params;
  const thickness = requiredCoilThickness(params, MAGNETS.lts);
  assert.ok(thickness !== null && thickness > 0.3 && thickness < 1.5);
  const e = evaluatePlant({ ...input(0), params: { ...params, tfCoilThickness: thickness! } });
  assert.ok(Math.abs(e.plasma.fieldAtCoil - MAGNETS.lts.peakField) < 1e-6);
});

test("l'optimum respecte les contraintes et fait au moins aussi bien que le départ", () => {
  const score: Record<Objective, (e: { plantEfficiency: number; netElectric: number; netPerTonne: number }) => number> = {
    efficiency: (e) => e.plantEfficiency,
    net: (e) => e.netElectric,
    specific: (e) => e.netPerTonne,
  };
  for (const objective of ['efficiency', 'net', 'specific'] as const) {
    const o = optimizePlant({ ...input(1), objective, maxMajorRadius: 10 });
    assert.ok(o.baseline && o.optimum);
    const optimum = o.optimum!;
    assert.ok(optimum.feasible);
    assert.ok(optimum.constraints[0].value <= MAX_WALL_LOAD + 1e-9);
    assert.ok(optimum.constraints[1].value <= MAX_DIVERTOR_LOAD + 1e-9);
    assert.ok(optimum.params.majorRadius <= 10 + 1e-9);
    assert.ok(optimum.params.elongation <= maxElongation(optimum.params.majorRadius / optimum.params.minorRadius));
    assert.ok(score[objective](optimum) >= score[objective](o.baseline!) - 1e-9, objective);
    assert.ok(optimum.netElectric > 0);
  }
});

test('la chaîne est cohérente : le net du transfert est celui du réacteur', () => {
  const e = evaluatePlant(input(1));
  assert.equal(e.netElectric, e.transfer.electric.net);
  assert.ok(Math.abs(e.plantEfficiency - e.netElectric / e.plasma.fusionPower) < 1e-12);
  assert.ok(Math.abs(e.plasma.alphaPower + e.plasma.auxPower - e.plasma.lossPower) < 1e-6 || e.plasma.auxPower >= 0.02 * e.plasma.fusionPower - 1e-9);
});

test('un domaine trop petit ne renvoie pas de faux optimum', () => {
  const o = optimizePlant({ ...input(0), objective: 'net', maxMajorRadius: 2 });
  assert.ok(o.optimum === null || o.optimum.feasible);
  assert.ok(o.limits.length > 0);
});
