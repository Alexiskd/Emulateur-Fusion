import { NEUTRON_FRACTION } from '../power/power';
import { ScenarioParams, SimulationInput, SimulationPhase, SimulationResult, SimulationSamples } from './simulation.types';

/**
 * Simulation 0D d'une impulsion de tokamak. Le plasma est décrit par son énergie thermique W :
 *
 *   dW/dt = P_alpha + P_chauffage + P_ohmique − W / τ_E
 *
 * La puissance de fusion suit la réactivité D-T (ajustement de Bosch-Hale) et le temps de
 * confinement τ_E se dégrade avec la puissance, comme dans les lois d'échelle expérimentales.
 * Le modèle est calé pour retrouver, en régime établi, la puissance de fusion du bilan énergétique.
 */

/** Point de fonctionnement nominal du plasma. */
export const NOMINAL_TEMPERATURE = 12; // keV
const NOMINAL_DENSITY = 1e20; // m⁻³
const KEV_IN_JOULES = 1.602176634e-16;
const FUSION_ENERGY_JOULES = 17.6e6 * 1.602176634e-19;
const TRITON_MASS_GRAMS = 5.0083e-24;
const SAMPLES_PER_PHASE = 80;

/** Réactivité D-T ⟨σv⟩ en cm³/s pour une température en keV (Bosch & Hale, 1992). */
export function dtReactivity(t: number): number {
  const bg = 34.3827;
  const mrc2 = 1124656;
  const c = [1.17302e-9, 1.51361e-2, 7.51886e-2, 4.60643e-3, 1.35e-2, -1.0675e-4, 1.366e-5];
  const theta = t / (1 - (t * (c[1] + t * (c[3] + t * c[5]))) / (1 + t * (c[2] + t * (c[4] + t * c[6]))));
  const xi = Math.cbrt((bg * bg) / (4 * theta));
  return c[0] * theta * Math.sqrt(xi / (mrc2 * t * t * t)) * Math.exp(-3 * xi);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};

const PHASES: Pick<SimulationPhase, 'id' | 'label' | 'description'>[] = [
  {
    id: 'premag',
    label: 'Pré-magnétisation',
    description: 'Le solénoïde central est chargé au courant maximal. Les bobines toroïdales sont déjà sous champ ; la chambre est vide.',
  },
  {
    id: 'ramp-up',
    label: 'Claquage et montée du courant',
    description: 'La décharge du solénoïde induit une tension qui ionise le gaz puis fait monter le courant plasma. Le chauffage est ohmique.',
  },
  {
    id: 'heating',
    label: 'Chauffage',
    description: 'Les chauffages auxiliaires (neutres, ondes) portent le plasma vers 150 millions de degrés ; la fusion démarre.',
  },
  {
    id: 'flat-top',
    label: 'Plateau de combustion',
    description: 'Régime établi : les particules alpha entretiennent la température, les neutrons chauffent la couverture, la turbine produit.',
  },
  {
    id: 'ramp-down',
    label: 'Descente',
    description: 'Le solénoïde arrive en bout de course. Chauffage coupé, le courant plasma est ramené à zéro de façon contrôlée.',
  },
  {
    id: 'dwell',
    label: 'Repos',
    description: "Pompage de la chambre et préparation de l'impulsion suivante. Cryogénie et aimants continuent de consommer.",
  },
];

export function simulatePulse({ power, plasmaVolume, scenario }: SimulationInput): SimulationResult {
  const durations = [
    scenario.premagDuration,
    scenario.rampUpDuration,
    scenario.heatingDuration,
    scenario.flatTopDuration,
    scenario.rampDownDuration,
    scenario.dwellDuration,
  ];
  const bounds = [0];
  for (const d of durations) bounds.push(bounds[bounds.length - 1] + d);
  const [, t1, t2, t3, t4, t5, t6] = bounds;

  // Consignes : courant plasma, chauffage auxiliaire et courant du solénoïde.
  const plasmaCurrent = (t: number) =>
    t < t4 ? smooth((t - t1) / scenario.rampUpDuration) : 1 - smooth((t - t4) / scenario.rampDownDuration);
  const auxPower = (t: number) => {
    if (t < t2) return 0;
    if (t < t4) return power.auxHeatingPower * clamp01((t - t2) / (0.5 * scenario.heatingDuration));
    return power.auxHeatingPower * (1 - clamp01((t - t4) / (0.3 * scenario.rampDownDuration)));
  };
  const solenoidCurrent = (t: number) => {
    if (t < t1) return smooth(t / scenario.premagDuration);
    if (t < t2) return 1 - 0.6 * smooth((t - t1) / scenario.rampUpDuration);
    if (t < t4) return 0.4 - (1.4 * (t - t2)) / (t4 - t2);
    return -1 + smooth((t - t4) / scenario.rampDownDuration);
  };

  // Point nominal : sert à caler le temps de confinement.
  const alphaFraction = 1 - NEUTRON_FRACTION;
  const energyPerKeV = (3 * NOMINAL_DENSITY * KEV_IN_JOULES * plasmaVolume) / 1e6; // MJ par keV à densité nominale
  const nominalEnergy = energyPerKeV * NOMINAL_TEMPERATURE;
  const nominalReactivity = dtReactivity(NOMINAL_TEMPERATURE);
  const ohmicCoefficient = 0.03 * (alphaFraction * power.fusionPower + power.auxHeatingPower);
  const ohmicPower = (ip: number, temp: number) => (ohmicCoefficient * ip * ip) / Math.max(temp, 0.05) ** 1.5;
  const nominalHeating =
    alphaFraction * power.fusionPower + power.auxHeatingPower + ohmicPower(1, NOMINAL_TEMPERATURE);
  const confinementTime = nominalEnergy / nominalHeating;

  const density = (t: number) => Math.max(plasmaCurrent(t), 0.02);
  const thermalLag = Math.min(60, Math.max(1, 0.05 * scenario.flatTopDuration));
  const dtMax = Math.max(Math.min(confinementTime / 25, Math.min(...durations) / 200), t6 / 2e6);

  // État
  let t = 0;
  let energy = energyPerKeV * density(0) * 0.01;
  let turbineHeat = 0;
  let netEnergy = 0;
  let tritium = 0;
  let peakTemperature = 0;
  let current = { ip: 0, temp: 0, aux: 0, fusion: 0, thermal: 0, gross: 0, net: 0 };

  const evaluate = () => {
    const ip = plasmaCurrent(t);
    const n = density(t);
    const temp = energy / (energyPerKeV * n);
    const fusion = ip > 0 ? (power.fusionPower * n * n * dtReactivity(temp)) / nominalReactivity : 0;
    const alpha = alphaFraction * fusion;
    const aux = auxPower(t);
    const ohmic = ohmicPower(ip, temp);
    const heating = alpha + aux + ohmic;
    const thermal = power.blanketMultiplication * NEUTRON_FRACTION * fusion + heating;
    const gross = power.thermalEfficiency * turbineHeat;
    const recirculated =
      aux / power.heatingEfficiency +
      power.cryoPower +
      power.magnetPower +
      power.pumpingFraction * turbineHeat +
      power.otherFraction * gross;
    current = { ip, temp: ip > 0.005 ? temp : 0, aux, fusion, thermal, gross, net: gross - recirculated };
    return { ip, n, temp, heating, thermal };
  };

  const advance = (target: number) => {
    const steps = Math.max(1, Math.ceil((target - t) / dtMax));
    const dt = (target - t) / steps;
    for (let i = 0; i < steps; i++) {
      const { ip, n, temp, heating, thermal } = evaluate();
      const tau =
        confinementTime *
        n ** 0.4 *
        Math.max(ip, 0.05) ** 0.9 *
        (Math.max(heating, 0.01 * nominalHeating) / nominalHeating) ** -0.69;
      // Les particules qui quittent le plasma emportent leur énergie.
      const dn = (density(t + dt) - n) / dt;
      const convection = dn < 0 ? energyPerKeV * temp * dn : 0;

      energy += (heating - energy / tau + convection) * dt;
      turbineHeat += ((thermal - turbineHeat) / thermalLag) * dt;
      netEnergy += current.net * dt;
      tritium += ((current.fusion * 1e6) / FUSION_ENERGY_JOULES) * TRITON_MASS_GRAMS * dt;
      t += dt;
      energy = Math.max(energy, energyPerKeV * density(t) * 0.01);
      if (current.temp > peakTemperature) peakTemperature = current.temp;
    }
    t = target;
  };

  const samples: SimulationSamples = {
    time: [],
    plasmaCurrent: [],
    solenoidCurrent: [],
    temperature: [],
    auxPower: [],
    fusionPower: [],
    thermalPower: [],
    grossElectric: [],
    netElectric: [],
    tritiumBurned: [],
  };
  const record = () => {
    evaluate();
    samples.time.push(t);
    samples.plasmaCurrent.push(current.ip);
    samples.solenoidCurrent.push(solenoidCurrent(t));
    samples.temperature.push(current.temp);
    samples.auxPower.push(current.aux);
    samples.fusionPower.push(current.fusion);
    samples.thermalPower.push(current.thermal);
    samples.grossElectric.push(current.gross);
    samples.netElectric.push(current.net);
    samples.tritiumBurned.push(tritium);
  };

  const phases: SimulationPhase[] = PHASES.map((phase, k) => ({
    ...phase,
    start: bounds[k],
    end: bounds[k + 1],
    startIndex: k * SAMPLES_PER_PHASE,
    endIndex: (k + 1) * SAMPLES_PER_PHASE,
  }));

  for (const phase of phases) {
    for (let j = 0; j < SAMPLES_PER_PHASE; j++) {
      advance(phase.start + ((phase.end - phase.start) * j) / SAMPLES_PER_PHASE);
      record();
    }
  }
  advance(t6);
  record();

  return {
    phases,
    samples,
    summary: {
      cycleDuration: t6,
      flatTopFusionPower: samples.fusionPower[phases[3].endIndex],
      peakTemperature,
      confinementTime,
      netEnergy: netEnergy / 3600,
      averageNetPower: netEnergy / t6,
      dutyFactor: scenario.flatTopDuration / t6,
      tritiumPerPulse: tritium,
    },
  };
}

export type { ScenarioParams };
