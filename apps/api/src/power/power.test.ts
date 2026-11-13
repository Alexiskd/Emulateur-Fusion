import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReactor } from '../reactor/geometry';
import { PRESETS } from '../reactor/presets';
import { computePowerBalance } from './power';

const near = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test("l'énergie est conservée à chaque étape", () => {
  for (const preset of PRESETS) {
    const p = preset.power;
    const b = computePowerBalance(p);
    near(b.neutronPower + b.alphaPower, p.fusionPower);
    near(b.grossElectric + b.rejectedHeat, b.thermalPower);
    near(b.netElectric + b.recirculating.total, b.grossElectric);
    const r = b.recirculating;
    near(r.heating + r.cryo + r.magnets + r.pumping + r.other, r.total);
  }
});

test('cas calculé à la main', () => {
  const b = computePowerBalance({
    fusionPower: 1760,
    auxHeatingPower: 50,
    heatingEfficiency: 0.5,
    blanketMultiplication: 1.2,
    thermalEfficiency: 0.4,
    cryoPower: 30,
    magnetPower: 20,
    pumpingFraction: 0.05,
    otherFraction: 0.05,
    firstWallArea: 1410,
  });
  near(b.neutronPower, 1410, 1e-6);
  near(b.thermalPower, 1410 * 1.2 + 350 + 50, 1e-6); // 2092
  near(b.grossElectric, 836.8, 1e-6);
  near(b.recirculating.total, 100 + 30 + 20 + 104.6 + 41.84, 1e-6);
  near(b.netElectric, 540.36, 1e-6);
  near(b.plasmaGain, 35.2, 1e-9);
  near(b.neutronWallLoad!, 1, 1e-9);
});

test('ordres de grandeur des machines types', () => {
  const [iter, demo] = PRESETS;
  // Type ITER : machine expérimentale, pas d'électricité nette.
  assert.ok(computePowerBalance(iter.power).netElectric < 0);
  // Type DEMO : quelques centaines de MW nets.
  const net = computePowerBalance(demo.power).netElectric;
  assert.ok(net > 300 && net < 800, `net DEMO ${net}`);
  // Charge neutronique type ITER autour de 0,5 MW/m².
  const area = buildReactor(iter.params).summary.firstWallArea;
  const load = computePowerBalance({ ...iter.power, firstWallArea: area }).neutronWallLoad!;
  assert.ok(load > 0.4 && load < 0.8, `charge ${load}`);
});
