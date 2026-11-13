import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRESETS } from '../reactor/presets';
import { COOLANTS, clampDesign, computeTransfer, optimizeTransfer } from './transfer';
import type { TransferDesign } from './transfer.types';

const demo = PRESETS[1];

test('chaque nœud interne du schéma conserve la puissance', () => {
  for (const preset of PRESETS) {
    const { flows } = computeTransfer(preset.power, preset.transfer);
    const sources = new Set(['fuel', 'multiplication', 'grid']);
    const sinks = new Set(['losses', 'cooling-towers', 'grid', 'cryo', 'magnets', 'cooling-aux', 'other']);
    const nodes = new Set(flows.flatMap((f) => [f.from, f.to]));
    for (const node of nodes) {
      if (sources.has(node) || sinks.has(node)) continue;
      const incoming = flows.filter((f) => f.to === node).reduce((s, f) => s + f.value, 0);
      const outgoing = flows.filter((f) => f.from === node).reduce((s, f) => s + f.value, 0);
      assert.ok(Math.abs(incoming - outgoing) < 1e-6 * Math.max(1, incoming), `${preset.id}/${node}: ${incoming} ≠ ${outgoing}`);
    }
  }
});

test('rendements de cycle réalistes pour les réglages de référence', () => {
  const at = (design: Partial<TransferDesign>) =>
    computeTransfer(demo.power, { ...demo.transfer, condenserTemperature: 35, ...design }).cycle.efficiency;
  const water = at({ coolant: 'water', inletTemperature: 285, outletTemperature: 325 });
  const helium = at({ coolant: 'helium', inletTemperature: 300, outletTemperature: 500 });
  const salt = at({ coolant: 'molten-salt', inletTemperature: 500, outletTemperature: 650 });
  assert.ok(water > 0.31 && water < 0.35, `eau ${water}`);
  assert.ok(helium > 0.35 && helium < 0.4, `hélium ${helium}`);
  assert.ok(salt > 0.43 && salt < 0.48, `sel ${salt}`);
});

test("l'optimum bat le réglage de départ et tout réglage admissible tiré au hasard", () => {
  let seed = 42;
  const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (const preset of PRESETS) {
    const { baseline, candidates } = optimizeTransfer(preset.power, preset.transfer);
    assert.equal(candidates.length, 3);
    assert.ok(candidates[0].result.electric.net >= candidates[1].result.electric.net);
    for (const candidate of candidates) {
      const coolant = COOLANTS[candidate.result.design.coolant];
      if (coolant.id === baseline.design.coolant) assert.ok(candidate.gain >= -1e-9);
      for (let i = 0; i < 300; i++) {
        const trial = clampDesign({
          coolant: coolant.id,
          inletTemperature: coolant.minInlet + random() * (coolant.maxInlet - coolant.minInlet),
          outletTemperature: coolant.minInlet + random() * (coolant.maxOutlet - coolant.minInlet),
          condenserTemperature: 25 + random() * 55,
          ambientTemperature: preset.transfer.ambientTemperature,
        });
        const net = computeTransfer(preset.power, trial).electric.net;
        assert.ok(net <= candidate.result.electric.net + 1e-3 * Math.abs(candidate.result.electric.net) + 0.01, `${preset.id}/${coolant.id}`);
      }
    }
  }
});

test('les valeurs équivalentes redonnent le même net dans le bilan simplifié', () => {
  const r = computeTransfer(demo.power, demo.transfer);
  const thermal = r.electric.gross / r.equivalent.thermalEfficiency;
  const rec = r.electric.recirculating;
  const simpleNet = r.electric.gross - rec.heating - rec.cryo - rec.magnets - r.equivalent.pumpingFraction * thermal - rec.other;
  assert.ok(Math.abs(simpleNet - r.electric.net) < 1e-6);
});

test('un réglage hors limites est ramené dans le domaine du caloporteur', () => {
  const d = clampDesign({ coolant: 'helium', inletTemperature: 100, outletTemperature: 900, condenserTemperature: 0, ambientTemperature: 20 });
  assert.deepEqual([d.inletTemperature, d.outletTemperature, d.condenserTemperature], [300, 520, 25]);
});
