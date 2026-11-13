import { NEUTRON_FRACTION } from '../power/power';
import type { PowerParams } from '../power/power.types';
import { Coolant, CoolantId, Flow, OptimizationResult, TransferDesign, TransferResult } from './transfer.types';

/**
 * Chaîne de transfert d'énergie d'une centrale à fusion, du plasma au réseau :
 * couverture et divertor → circuit primaire → générateur de vapeur → turbine et alternateur
 * → poste électrique, avec la source froide et les consommations internes.
 *
 * Contrairement au bilan simplifié, le rendement et le pompage ne sont plus des hypothèses :
 * ils découlent des températures du caloporteur, ce qui fait apparaître des compromis à optimiser.
 */

export const COOLANTS: Record<CoolantId, Coolant> = {
  water: {
    id: 'water',
    label: 'Eau pressurisée',
    maturity: 'Technologie éprouvée (réacteurs à eau pressurisée) ; option WCLL du DEMO européen.',
    heatCapacity: 5.5,
    minInlet: 60,
    maxInlet: 315,
    maxOutlet: 325,
    minDeltaT: 10,
    inletLimitReason: "température d'entrée minimale du circuit",
    outletLimitReason: "marge à l'ébullition sous 15,5 MPa",
    pumpingFractionRef: 0.01,
    deltaTRef: 40,
    pinch: 15,
  },
  helium: {
    id: 'helium',
    label: 'Hélium',
    maturity: 'Option HCPB du DEMO européen ; échangeurs et soufflantes de grande taille à développer.',
    heatCapacity: 5.19,
    minInlet: 300,
    maxInlet: 470,
    maxOutlet: 520,
    minDeltaT: 50,
    inletLimitReason: "fragilisation de l'acier Eurofer sous irradiation en dessous de 300 °C",
    outletLimitReason: "tenue au fluage de l'acier Eurofer (environ 550 °C)",
    pumpingFractionRef: 0.05,
    deltaTRef: 200,
    pinch: 25,
  },
  'molten-salt': {
    id: 'molten-salt',
    label: 'Sel fondu (FLiBe)',
    maturity: 'Concept avancé (type ARC) ; matériaux de structure à haute température encore à qualifier.',
    heatCapacity: 2.39,
    minInlet: 480,
    maxInlet: 630,
    maxOutlet: 650,
    minDeltaT: 20,
    inletLimitReason: 'marge au gel du sel (solidification vers 459 °C)',
    outletLimitReason: 'limite des matériaux de structure avancés',
    pumpingFractionRef: 0.008,
    deltaTRef: 100,
    pinch: 15,
  },
};

const KELVIN = 273.15;
/** Part du rendement de Carnot atteinte par un cycle réel. */
const CYCLE_QUALITY = 0.73;
const GENERATOR_EFFICIENCY = 0.98;
/** Part de la puissance des alphas et du chauffage rayonnée vers la première paroi ; le reste va au divertor. */
const WALL_FRACTION = 0.6;
/** Le divertor est refroidi à l'eau à basse température : sa chaleur ne sert qu'au préchauffage. */
const DIVERTOR_TEMPERATURE = 150;
const DIVERTOR_PUMPING_FRACTION = 0.005;
/** Part de la puissance des pompes qui se retrouve en chaleur dans le caloporteur. */
const PUMP_HEAT_RECOVERY = 0.9;
/** Consommation du refroidissement : MW électriques par MW rejeté et par kelvin d'écart à l'ambiante. */
const COOLING_COEFFICIENT = 0.12;
export const MIN_CONDENSER_APPROACH = 5;
export const MAX_CONDENSER_TEMPERATURE = 80;

/** Ramène un réglage dans les limites physiques de son caloporteur. */
export function clampDesign(design: TransferDesign): TransferDesign {
  const c = COOLANTS[design.coolant];
  const outlet = Math.min(c.maxOutlet, Math.max(c.minInlet + c.minDeltaT, design.outletTemperature));
  const inlet = Math.min(Math.min(c.maxInlet, outlet - c.minDeltaT), Math.max(c.minInlet, design.inletTemperature));
  const condenser = Math.min(
    MAX_CONDENSER_TEMPERATURE,
    Math.max(design.ambientTemperature + MIN_CONDENSER_APPROACH, design.condenserTemperature),
  );
  return { ...design, inletTemperature: inlet, outletTemperature: outlet, condenserTemperature: condenser };
}

interface Core {
  net: number;
  gross: number;
  blanket: number;
  divertor: number;
  primary: number;
  rejected: number;
  pump: number;
  cooling: number;
  heating: number;
  other: number;
  efficiency: number;
  carnot: number;
  divertorEfficiency: number;
  meanTemperature: number;
}

/** Cœur du calcul, sans allocation de structure : appelé des dizaines de milliers de fois par l'optimiseur. */
function core(power: PowerParams, coolant: Coolant, inlet: number, outlet: number, condenser: number, ambient: number): Core {
  const neutron = power.fusionPower * NEUTRON_FRACTION;
  const charged = power.fusionPower - neutron + power.auxHeatingPower;
  const blanket = neutron * power.blanketMultiplication + WALL_FRACTION * charged;
  const divertor = (1 - WALL_FRACTION) * charged;

  // Circuit primaire : à chaleur donnée, le débit varie en 1/ΔT et la puissance de pompage en débit³.
  const deltaT = outlet - inlet;
  const pump = blanket * Math.min(0.5, coolant.pumpingFractionRef * (coolant.deltaTRef / deltaT) ** 3);
  const primary = blanket + PUMP_HEAT_RECOVERY * pump;

  // Cycle : le rendement suit la température moyenne à laquelle la chaleur est cédée.
  const cold = condenser + KELVIN;
  const meanKelvin = deltaT / Math.log((outlet + KELVIN) / (inlet + KELVIN));
  const carnot = Math.max(0, 1 - cold / (meanKelvin - coolant.pinch));
  const efficiency = CYCLE_QUALITY * carnot;
  const divertorEfficiency = CYCLE_QUALITY * Math.max(0, 1 - cold / (DIVERTOR_TEMPERATURE + KELVIN - 15));

  const gross = GENERATOR_EFFICIENCY * (efficiency * primary + divertorEfficiency * divertor);
  const rejected = primary + divertor - gross;

  // Source froide : plus le condenseur est proche de l'ambiante, plus il faut d'air et d'eau.
  const cooling = (COOLING_COEFFICIENT * rejected) / (condenser - ambient) + DIVERTOR_PUMPING_FRACTION * divertor;
  const heating = power.auxHeatingPower / power.heatingEfficiency;
  const other = power.otherFraction * gross;
  const net = gross - heating - power.cryoPower - power.magnetPower - pump - cooling - other;

  return {
    net,
    gross,
    blanket,
    divertor,
    primary,
    rejected,
    pump,
    cooling,
    heating,
    other,
    efficiency,
    carnot,
    divertorEfficiency,
    meanTemperature: meanKelvin - KELVIN,
  };
}

function buildFlows(power: PowerParams, k: Core): Flow[] {
  const neutron = power.fusionPower * NEUTRON_FRACTION;
  const charged = power.fusionPower - neutron + power.auxHeatingPower;
  const flows: Flow[] = [
    { from: 'fuel', to: 'plasma', value: power.fusionPower, kind: 'fusion' },
    { from: 'heating', to: 'plasma', value: power.auxHeatingPower, kind: 'heat' },
    { from: 'heating', to: 'losses', value: k.heating - power.auxHeatingPower, kind: 'loss' },
    { from: 'plasma', to: 'blanket', value: neutron * Math.min(1, power.blanketMultiplication) + WALL_FRACTION * charged, kind: 'fusion' },
    // Couverture trop mince : une part des neutrons la traverse et se perd dans le blindage.
    { from: 'plasma', to: 'losses', value: neutron * Math.max(0, 1 - power.blanketMultiplication), kind: 'loss' },
    { from: 'plasma', to: 'divertor', value: (1 - WALL_FRACTION) * charged, kind: 'fusion' },
    { from: 'multiplication', to: 'blanket', value: neutron * (power.blanketMultiplication - 1), kind: 'fusion' },
    { from: 'blanket', to: 'primary', value: k.blanket, kind: 'heat' },
    { from: 'pumps', to: 'primary', value: PUMP_HEAT_RECOVERY * k.pump, kind: 'heat' },
    { from: 'pumps', to: 'losses', value: (1 - PUMP_HEAT_RECOVERY) * k.pump, kind: 'loss' },
    { from: 'primary', to: 'steam-generator', value: k.primary, kind: 'heat' },
    { from: 'divertor', to: 'preheater', value: k.divertor, kind: 'low-heat' },
    { from: 'steam-generator', to: 'turbine', value: k.primary, kind: 'heat' },
    { from: 'preheater', to: 'turbine', value: k.divertor, kind: 'low-heat' },
    { from: 'turbine', to: 'switchyard', value: k.gross, kind: 'electric' },
    { from: 'turbine', to: 'condenser', value: k.rejected, kind: 'low-heat' },
    { from: 'condenser', to: 'cooling-towers', value: k.rejected, kind: 'loss' },
    { from: 'switchyard', to: 'heating', value: k.heating, kind: 'electric' },
    { from: 'switchyard', to: 'pumps', value: k.pump, kind: 'electric' },
    { from: 'switchyard', to: 'cooling-aux', value: k.cooling, kind: 'electric' },
    { from: 'switchyard', to: 'cryo', value: power.cryoPower, kind: 'electric' },
    { from: 'switchyard', to: 'magnets', value: power.magnetPower, kind: 'electric' },
    { from: 'switchyard', to: 'other', value: k.other, kind: 'electric' },
    // Bilan positif : la centrale exporte. Négatif : elle soutire au réseau.
    k.net >= 0
      ? { from: 'switchyard', to: 'grid', value: k.net, kind: 'electric' }
      : { from: 'grid', to: 'switchyard', value: -k.net, kind: 'electric' },
  ];
  return flows.filter((f) => f.value > 1e-9);
}

export function computeTransfer(power: PowerParams, rawDesign: TransferDesign): TransferResult {
  const design = clampDesign(rawDesign);
  const coolant = COOLANTS[design.coolant];
  const k = core(
    power,
    coolant,
    design.inletTemperature,
    design.outletTemperature,
    design.condenserTemperature,
    design.ambientTemperature,
  );
  const deltaT = design.outletTemperature - design.inletTemperature;
  const neutron = power.fusionPower * NEUTRON_FRACTION;
  const simpleThermal = neutron * power.blanketMultiplication + power.fusionPower - neutron + power.auxHeatingPower;
  const total = k.heating + power.cryoPower + power.magnetPower + k.pump + k.cooling + k.other;

  return {
    design,
    coolant,
    heat: { blanket: k.blanket, divertor: k.divertor, primary: k.primary, rejected: k.rejected },
    primary: {
      massFlow: (k.blanket * 1000) / (coolant.heatCapacity * deltaT),
      deltaT,
      pumpPower: k.pump,
      meanTemperature: k.meanTemperature,
    },
    cycle: { efficiency: k.efficiency, carnotEfficiency: k.carnot, divertorEfficiency: k.divertorEfficiency },
    electric: {
      gross: k.gross,
      net: k.net,
      recirculating: {
        heating: k.heating,
        cryo: power.cryoPower,
        magnets: power.magnetPower,
        primaryPumps: k.pump,
        cooling: k.cooling,
        other: k.other,
        total,
      },
    },
    plantEfficiency: k.net / power.fusionPower,
    equivalent: {
      thermalEfficiency: k.gross / simpleThermal,
      pumpingFraction: (k.pump + k.cooling) / simpleThermal,
    },
    flows: buildFlows(power, k),
  };
}

function range(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) values.push(Math.min(max, v));
  return values;
}

/** Meilleur réglage d'un caloporteur : balayage grossier puis affinage autour du meilleur point. */
function optimizeCoolant(power: PowerParams, coolant: Coolant, ambient: number): TransferDesign {
  const condenserMin = ambient + MIN_CONDENSER_APPROACH;
  let best = { net: -Infinity, inlet: coolant.minInlet, outlet: coolant.maxOutlet, condenser: condenserMin };

  const search = (inlets: number[], outlets: number[], condensers: number[]) => {
    for (const outlet of outlets) {
      for (const inlet of inlets) {
        if (outlet - inlet < coolant.minDeltaT - 1e-9) continue;
        for (const condenser of condensers) {
          const { net } = core(power, coolant, inlet, outlet, condenser, ambient);
          if (net > best.net) best = { net, inlet, outlet, condenser };
        }
      }
    }
  };

  search(
    range(coolant.minInlet, coolant.maxInlet, 5),
    range(coolant.minInlet + coolant.minDeltaT, coolant.maxOutlet, 5),
    range(condenserMin, MAX_CONDENSER_TEMPERATURE, 1),
  );
  const around = (value: number, span: number, min: number, max: number, step: number) =>
    range(Math.max(min, value - span), Math.min(max, value + span), step);
  search(
    around(best.inlet, 5, coolant.minInlet, coolant.maxInlet, 0.5),
    around(best.outlet, 5, coolant.minInlet + coolant.minDeltaT, coolant.maxOutlet, 0.5),
    around(best.condenser, 1, condenserMin, MAX_CONDENSER_TEMPERATURE, 0.1),
  );

  return {
    coolant: coolant.id,
    inletTemperature: best.inlet,
    outletTemperature: best.outlet,
    condenserTemperature: Math.round(best.condenser * 10) / 10,
    ambientTemperature: ambient,
  };
}

/** Meilleures températures pour un caloporteur donné. */
export function optimizeCoolantDesign(power: PowerParams, coolant: CoolantId, ambient: number): TransferDesign {
  return optimizeCoolant(power, COOLANTS[coolant], ambient);
}

function activeLimits(result: TransferResult): string[] {
  const { design, coolant } = result;
  const limits: string[] = [];
  if (design.outletTemperature >= coolant.maxOutlet - 0.25) {
    limits.push(`Sortie plafonnée à ${coolant.maxOutlet} °C : ${coolant.outletLimitReason}.`);
  }
  if (design.inletTemperature <= coolant.minInlet + 0.25) {
    limits.push(`Entrée au plancher de ${coolant.minInlet} °C : ${coolant.inletLimitReason}.`);
  }
  if (design.condenserTemperature <= design.ambientTemperature + MIN_CONDENSER_APPROACH + 0.05) {
    limits.push("Condenseur au plus près de l'ambiante.");
  }
  return limits;
}

/** Cherche, pour chaque caloporteur, le réglage qui maximise l'électricité nette. */
export function optimizeTransfer(power: PowerParams, design: TransferDesign): OptimizationResult {
  const baseline = computeTransfer(power, design);
  const candidates = Object.values(COOLANTS)
    .map((coolant) => {
      const result = computeTransfer(power, optimizeCoolant(power, coolant, baseline.design.ambientTemperature));
      return { result, gain: result.electric.net - baseline.electric.net, activeLimits: activeLimits(result) };
    })
    .sort((a, b) => b.result.electric.net - a.result.electric.net);
  return { baseline, candidates };
}
