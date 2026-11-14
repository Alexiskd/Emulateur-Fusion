import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReactor } from '../reactor/geometry';
import { PRESETS } from '../reactor/presets';
import { dtReactivity, NOMINAL_TEMPERATURE, simulatePulse } from './simulation';

const run = (i: number) => {
  const preset = PRESETS[i];
  const plasmaVolume = buildReactor(preset.params).summary.plasmaVolume;
  return { preset, result: simulatePulse({ power: preset.power, plasmaVolume, scenario: preset.scenario }) };
};

test('réactivité D-T : valeurs de référence de Bosch-Hale', () => {
  assert.ok(Math.abs(dtReactivity(10) / 1.136e-16 - 1) < 0.02);
  assert.ok(Math.abs(dtReactivity(20) / 4.33e-16 - 1) < 0.02);
});

test('le plateau retrouve la puissance de fusion nominale', () => {
  for (let i = 0; i < PRESETS.length; i++) {
    const { preset, result } = run(i);
    const ratio = result.summary.flatTopFusionPower / preset.power.fusionPower;
    assert.ok(Math.abs(ratio - 1) < 0.03, `${preset.id} : ${ratio}`);
    assert.ok(Math.abs(result.summary.peakTemperature / NOMINAL_TEMPERATURE - 1) < 0.15, `${preset.id} T`);
  }
});

test('séries cohérentes : même longueur, valeurs finies, plasma éteint aux extrémités', () => {
  const { result } = run(0);
  const { samples, phases } = result;
  const n = samples.time.length;
  assert.equal(n, phases[phases.length - 1].endIndex + 1);
  for (const series of Object.values(samples)) {
    assert.equal(series.length, n);
    assert.ok(series.every(Number.isFinite));
  }
  for (let i = 1; i < n; i++) assert.ok(samples.time[i] > samples.time[i - 1]);
  assert.equal(samples.fusionPower[0], 0);
  assert.ok(samples.fusionPower[n - 1] < 1e-3);
  assert.ok(samples.plasmaCurrent.every((v) => v >= 0 && v <= 1));
  assert.ok(samples.solenoidCurrent.every((v) => v >= -1.0001 && v <= 1.0001));
});

test('une machine pulsée produit moins en moyenne que sur son plateau', () => {
  const { result } = run(1);
  const plateau = result.samples.netElectric[result.phases[3].endIndex];
  assert.ok(plateau > 300);
  assert.ok(result.summary.averageNetPower < plateau);
  assert.ok(result.summary.averageNetPower > 0);
});

test('tritium consommé : environ 0,36 g pour 500 MW pendant 400 s', () => {
  const { result } = run(0);
  assert.ok(result.summary.tritiumPerPulse > 0.3 && result.summary.tritiumPerPulse < 0.5);
});

test('mode continu : le solénoïde reste figé pendant le plateau et la combustion occupe plus de temps', () => {
  const preset = PRESETS[1];
  const plasmaVolume = buildReactor(preset.params).summary.plasmaVolume;
  const pulsed = simulatePulse({ power: preset.power, plasmaVolume, scenario: preset.scenario });
  const steady = simulatePulse({
    power: preset.power,
    plasmaVolume,
    scenario: { ...preset.scenario, mode: 'steady', flatTopDuration: 28800 },
  });
  const plateau = steady.phases[3];
  const during = steady.samples.solenoidCurrent.slice(plateau.startIndex, plateau.endIndex);
  assert.ok(during.every((v) => Math.abs(v - 0.4) < 1e-9));
  assert.equal(plateau.label, 'Régime continu');
  assert.equal(pulsed.phases[3].label, 'Plateau de combustion');
  assert.ok(Math.min(...pulsed.samples.solenoidCurrent) < -0.99);
  assert.ok(steady.summary.dutyFactor > pulsed.summary.dutyFactor);
  assert.ok(Math.abs(steady.summary.flatTopFusionPower / preset.power.fusionPower - 1) < 0.03);
});

test('point de fonctionnement fourni : la simulation plafonne à cette température', () => {
  const preset = PRESETS[1];
  const plasmaVolume = buildReactor(preset.params).summary.plasmaVolume;
  const r = simulatePulse({ power: preset.power, plasmaVolume, scenario: preset.scenario, nominal: { temperature: 20, density: 0.7 } });
  assert.ok(Math.abs(r.summary.peakTemperature / 20 - 1) < 0.15, `T ${r.summary.peakTemperature}`);
  assert.ok(Math.abs(r.summary.flatTopFusionPower / preset.power.fusionPower - 1) < 0.03);
});
