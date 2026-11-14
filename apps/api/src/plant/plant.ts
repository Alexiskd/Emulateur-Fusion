import { NEUTRON_FRACTION } from '../power/power';
import type { PowerParams } from '../power/power.types';
import { buildReactor, loop, revolveSurfaceArea, revolveVolume } from '../reactor/geometry';
import type { ReactorParams } from '../reactor/reactor.types';
import { dtReactivity } from '../simulation/simulation';
import { computeTransfer, optimizeCoolantDesign } from '../transfer/transfer';
import type { TransferDesign } from '../transfer/transfer.types';
import {
  Constraint,
  MagnetId,
  MagnetTechnology,
  Objective,
  Operation,
  PlantEvaluation,
  PlantInput,
  PlantOptimization,
  PlantOptimizationInput,
} from './plant.types';

/**
 * Modèle de la centrale complète, de la géométrie à l'électricité nette, dans l'esprit des codes
 * systèmes (PROCESS, Bluemira) :
 *
 *   géométrie → champ magnétique → courant plasma → densité et pression → puissance de fusion
 *   → chauffage nécessaire → chaleur → électricité brute → électricité nette.
 *
 * Chaque maillon est une loi d'échelle classique de la physique des tokamaks.
 */

export const MAGNETS: Record<MagnetId, MagnetTechnology> = {
  lts: { id: 'lts', label: 'Supraconducteur Nb3Sn (12 T)', peakField: 11.8, currentDensity: 13 },
  hts: { id: 'hts', label: 'Supraconducteur haute température (20 T)', peakField: 20, currentDensity: 30 },
};

/**
 * Point de fonctionnement du plasma selon le mode.
 * En continu, on vise un scénario « avancé » : moins de courant (facteur de sécurité plus élevé),
 * plus de pression et un meilleur confinement, pour que le plasma génère lui-même une grande part de son courant.
 */
const SCENARIOS: Record<Operation, { safetyFactor: number; normalizedBeta: number; confinementFactor: number }> = {
  pulsed: { safetyFactor: 3, normalizedBeta: 2.0, confinementFactor: 1.0 },
  // Le confinement amélioré (H = 1,6) est l'hypothèse des scénarios stationnaires d'ITER ; il reste à démontrer.
  steady: { safetyFactor: 5, normalizedBeta: 3.0, confinementFactor: 1.6 },
};
/** Fraction de la limite de densité de Greenwald. */
const GREENWALD_FRACTION = 0.85;
/** Effet combiné des profils piqués et de la dilution du combustible sur la puissance de fusion. */
const FUSION_FACTOR = 0.8;
/** Part de la puissance de chauffage rayonnée avant d'atteindre le divertor. */
const RADIATED_FRACTION = 0.7;
/** Chauffage minimal conservé pour piloter le plasma, en part de la puissance de fusion. */
const MIN_AUX_FRACTION = 0.02;

export const MAX_WALL_LOAD = 2; // MW/m²
export const MAX_DIVERTOR_LOAD = 17; // MW/m
const MU0 = 4e-7 * Math.PI;
const KEV = 1.602176634e-16;
const FUSION_ENERGY = 17.6e6 * 1.602176634e-19;

/** Élongation maximale stable verticalement, en fonction du rapport d'aspect. */
export function maxElongation(aspectRatio: number): number {
  return Math.min(2.2, 1.5 + 0.5 / (aspectRatio - 1));
}

/** Couverture : part de l'énergie des neutrons captée, multipliée par les réactions nucléaires. */
export function blanketMultiplication(thickness: number): number {
  return 1.3 * (1 - Math.exp(-thickness / 0.2));
}

const inboardBuild = (p: ReactorParams) =>
  p.scrapeOffLayer + p.firstWallThickness + p.blanketThickness + p.shieldThickness + p.vesselThickness + p.vesselCoilGap;

/** Épaisseur de bobine toroïdale tout juste suffisante pour atteindre le champ maximal du conducteur. */
export function requiredCoilThickness(p: ReactorParams, magnet: MagnetTechnology): number | null {
  const outerFace = p.majorRadius - p.minorRadius - inboardBuild(p);
  if (outerFace <= 0) return null;
  const ampereTurns = 5 * magnet.peakField * outerFace; // MA
  const innerSquared = outerFace * outerFace - ampereTurns / (Math.PI * magnet.currentDensity);
  return innerSquared > 0 ? outerFace - Math.sqrt(innerSquared) : null;
}

/**
 * Évalue un réacteur. Lève une erreur si l'empilement radial est impossible ;
 * les autres limites sont rapportées dans `constraints`.
 */
export function evaluatePlant({ params, power, design, magnet: magnetId, operation = 'pulsed' }: PlantInput): PlantEvaluation {
  const magnet = MAGNETS[magnetId];
  const scenario = SCENARIOS[operation];
  const { majorRadius: R, minorRadius: a, elongation: kappa, triangularity: delta } = params;
  const model = buildReactor(params); // vérifie aussi que tout tient côté intérieur
  const epsilon = a / R;

  // Champ : limité par le conducteur et par la section de cuivre disponible dans la jambe intérieure.
  const outerFace = R - a - inboardBuild(params);
  const innerFace = Math.max(0, outerFace - params.tfCoilThickness);
  const ampereTurns = magnet.currentDensity * Math.PI * (outerFace ** 2 - innerFace ** 2);
  const fieldAtCoil = Math.min(magnet.peakField, ampereTurns / (5 * outerFace));
  const field = (fieldAtCoil * outerFace) / R;

  // Courant plasma au facteur de sécurité choisi, avec l'effet de la forme.
  const shape = ((1 + kappa ** 2 * (1 + 2 * delta ** 2 - 1.2 * delta ** 3)) / 2) * ((1.17 - 0.65 * epsilon) / (1 - epsilon ** 2) ** 2);
  const current = ((5 * a * a * field) / (R * scenario.safetyFactor)) * shape;

  // Densité (Greenwald) et pression (bêta) : elles fixent la température.
  const density = (GREENWALD_FRACTION * current) / (Math.PI * a * a); // 10²⁰ m⁻³
  const beta = (scenario.normalizedBeta * current) / (a * field); // %
  const pressure = ((beta / 100) * field * field) / (2 * MU0); // Pa
  const temperature = pressure / (2 * density * 1e20 * KEV);

  const volume = revolveVolume(loop(params, 0, 64));
  const reactions = ((density * 1e20) ** 2 / 4) * dtReactivity(temperature) * 1e-6; // par m³ et par s
  const fusionPower = (FUSION_FACTOR * reactions * FUSION_ENERGY * volume) / 1e6;
  const alphaPower = fusionPower * (1 - NEUTRON_FRACTION);
  const neutronPower = fusionPower * NEUTRON_FRACTION;

  // Confinement IPB98(y,2) : τ = C·P^-0,69, donc les pertes valent (W/C)^(1/0,31).
  const energy = (1.5 * pressure * volume) / 1e6; // MJ
  const coefficient =
    0.0562 * scenario.confinementFactor * current ** 0.93 * field ** 0.15 * (10 * density) ** 0.41 * R ** 1.97 * epsilon ** 0.58 * kappa ** 0.78 * 2.5 ** 0.19;
  const lossPower = (energy / coefficient) ** (1 / 0.31);

  // Courant auto-généré (bootstrap) : il croît avec la pression rapportée au champ poloïdal.
  const poloidalField = (MU0 * current * 1e6) / (2 * Math.PI * a * Math.sqrt((1 + kappa ** 2) / 2));
  const poloidalBeta = (beta / 100) * (field / poloidalField) ** 2;
  const bootstrapFraction = Math.min(0.9, 0.6 * Math.sqrt(epsilon) * poloidalBeta);
  // En continu, le reste du courant est entretenu par injection de puissance ;
  // l'efficacité de cet entraînement augmente avec la température.
  const driveEfficiency = Math.min(0.6, Math.max(0.15, 0.03 * temperature)); // 10²⁰ A/W/m²
  const currentDrivePower =
    operation === 'steady' ? (density * R * current * (1 - bootstrapFraction)) / driveEfficiency : 0;

  const auxPower = Math.max(lossPower - alphaPower, currentDrivePower, MIN_AUX_FRACTION * fusionPower, 1);

  // Consommations qui dépendent de la machine.
  const mass = (id: string) => model.components.filter((c) => c.id.startsWith(id)).reduce((s, c) => s + (c.mass ?? 0), 0);
  const coilMass = mass('tf-coils') + mass('central-solenoid') + mass('pf-coil');
  const shielding = params.blanketThickness + params.shieldThickness + params.vesselThickness;
  // Chaque watt déposé à 4 K coûte environ 300 W électriques.
  const nuclearHeating = 300 * neutronPower * Math.exp(-shielding / 0.1);
  const derivedPower: PowerParams = {
    fusionPower,
    auxHeatingPower: auxPower,
    heatingEfficiency: power.heatingEfficiency,
    blanketMultiplication: blanketMultiplication(params.blanketThickness),
    thermalEfficiency: power.thermalEfficiency,
    cryoPower: 0.006 * coilMass + nuclearHeating,
    magnetPower: 5 + 0.003 * coilMass,
    pumpingFraction: power.pumpingFraction,
    otherFraction: power.otherFraction,
  };
  const transfer = computeTransfer(derivedPower, design);
  derivedPower.thermalEfficiency = transfer.equivalent.thermalEfficiency;
  derivedPower.pumpingFraction = transfer.equivalent.pumpingFraction;

  const wallLoad = neutronPower / model.summary.firstWallArea;
  const divertorLoad = ((1 - RADIATED_FRACTION) * (alphaPower + auxPower)) / R;
  const kappaMax = maxElongation(R / a);
  const constraints: Constraint[] = [
    { id: 'wall-load', label: 'Charge neutronique sur la paroi', value: wallLoad, limit: MAX_WALL_LOAD, unit: 'MW/m²', ok: wallLoad <= MAX_WALL_LOAD + 1e-9 },
    { id: 'divertor', label: 'Puissance au divertor par mètre', value: divertorLoad, limit: MAX_DIVERTOR_LOAD, unit: 'MW/m', ok: divertorLoad <= MAX_DIVERTOR_LOAD + 1e-9 },
    { id: 'elongation', label: 'Élongation (stabilité verticale)', value: kappa, limit: kappaMax, unit: '', ok: kappa <= kappaMax + 1e-9 },
  ];

  const netElectric = transfer.electric.net;
  return {
    params,
    magnet,
    operation,
    plasma: {
      fieldOnAxis: field,
      fieldAtCoil,
      current,
      density,
      temperature,
      beta,
      fusionPower,
      alphaPower,
      lossPower,
      auxPower,
      bootstrapFraction,
      currentDrivePower,
      gain: fusionPower / auxPower,
      confinementTime: energy / lossPower,
    },
    constraints,
    feasible: constraints.every((c) => c.ok),
    power: derivedPower,
    transfer,
    mass: model.summary.totalMass,
    netElectric,
    plantEfficiency: netElectric / fusionPower,
    netPerTonne: (netElectric * 1000) / model.summary.totalMass,
  };
}

const SCORE: Record<Objective, (e: PlantEvaluation) => number> = {
  efficiency: (e) => e.plantEfficiency,
  net: (e) => e.netElectric,
  specific: (e) => e.netPerTonne,
};

/** Variables de conception explorées : taille, rapport d'aspect, couverture et blindage. */
interface Candidate {
  majorRadius: number;
  aspectRatio: number;
  blanket: number;
  shield: number;
}

const BOUNDS = {
  minMajorRadius: 1.5,
  aspectRatio: [2.6, 4.5],
  blanket: [0.15, 1.2],
  shield: [0.1, 0.8],
} as const;

function steps(min: number, max: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1));
}

export function optimizePlant(input: PlantOptimizationInput): PlantOptimization {
  const magnet = MAGNETS[input.magnet];
  const score = SCORE[input.objective];
  const maxRadius = Math.max(BOUNDS.minMajorRadius + 0.5, input.maxMajorRadius);
  let evaluations = 0;

  let baseline: PlantEvaluation | null = null;
  let baselineError: string | null = null;
  try {
    baseline = evaluatePlant(input);
  } catch (err) {
    baselineError = err instanceof Error ? err.message : 'Réacteur de départ impossible à évaluer.';
  }

  // Les températures optimales du circuit dépendent très peu de la taille : on les fixe une fois,
  // puis on les ajuste à la fin sur le réacteur retenu.
  let design: TransferDesign = optimizeCoolantDesign(
    baseline?.power ?? input.power,
    input.design.coolant,
    input.design.ambientTemperature,
  );

  const build = (c: Candidate): ReactorParams | null => {
    const minorRadius = c.majorRadius / c.aspectRatio;
    const params: ReactorParams = {
      ...input.params,
      majorRadius: c.majorRadius,
      minorRadius,
      elongation: 0.97 * maxElongation(c.aspectRatio),
      blanketThickness: c.blanket,
      shieldThickness: c.shield,
    };
    const coil = requiredCoilThickness(params, magnet);
    if (coil === null || coil > 3) return null;
    return { ...params, tfCoilThickness: Math.max(0.05, coil) };
  };

  const evaluate = (c: Candidate): PlantEvaluation | null => {
    const params = build(c);
    if (!params) return null;
    evaluations++;
    try {
      const evaluation = evaluatePlant({ params, power: input.power, design, magnet: input.magnet, operation: input.operation });
      return evaluation.feasible ? evaluation : null;
    } catch {
      return null; // l'empilement radial ne tient pas
    }
  };

  interface Best {
    candidate: Candidate;
    evaluation: PlantEvaluation;
    score: number;
  }
  const search: { best: Best | null } = { best: null };
  const consider = (candidate: Candidate) => {
    const evaluation = evaluate(candidate);
    if (!evaluation) return;
    const value = score(evaluation);
    if (!search.best || value > search.best.score) search.best = { candidate, evaluation, score: value };
  };

  // 1. Balayage grossier de tout le domaine.
  for (const majorRadius of steps(BOUNDS.minMajorRadius, maxRadius, 16)) {
    for (const aspectRatio of steps(BOUNDS.aspectRatio[0], BOUNDS.aspectRatio[1], 7)) {
      for (const blanket of steps(BOUNDS.blanket[0], BOUNDS.blanket[1], 7)) {
        for (const shield of steps(BOUNDS.shield[0], BOUNDS.shield[1], 5)) {
          consider({ majorRadius, aspectRatio, blanket, shield });
        }
      }
    }
  }

  // 2. Affinage : on déplace une variable à la fois, avec un pas qui diminue.
  const ranges: Record<keyof Candidate, [number, number]> = {
    majorRadius: [BOUNDS.minMajorRadius, maxRadius],
    aspectRatio: [BOUNDS.aspectRatio[0], BOUNDS.aspectRatio[1]],
    blanket: [BOUNDS.blanket[0], BOUNDS.blanket[1]],
    shield: [BOUNDS.shield[0], BOUNDS.shield[1]],
  };
  const keys = Object.keys(ranges) as (keyof Candidate)[];
  for (let round = 0, fraction = 0.04; search.best && round < 5; round++, fraction /= 2) {
    let improved = true;
    for (let pass = 0; improved && pass < 6; pass++) {
      improved = false;
      for (const key of keys) {
        const [min, max] = ranges[key];
        for (const direction of [-1, 1]) {
          const current: Best | null = search.best;
          if (!current) continue;
          const value = Math.min(max, Math.max(min, current.candidate[key] + direction * fraction * (max - min)));
          consider({ ...current.candidate, [key]: value });
          if (search.best !== current) improved = true;
        }
      }
    }
  }

  const found: Best | null = search.best;
  if (!found) {
    return {
      objective: input.objective,
      baseline,
      baselineError,
      optimum: null,
      limits: ["Aucun réacteur ne respecte toutes les contraintes dans le domaine exploré : augmentez le grand rayon maximal ou changez d'aimants."],
      evaluations,
    };
  }

  // 3. Températures du circuit réajustées sur le réacteur retenu.
  design = optimizeCoolantDesign(found.evaluation.power, input.design.coolant, input.design.ambientTemperature);
  const optimum = evaluatePlant({ params: found.evaluation.params, power: input.power, design, magnet: input.magnet, operation: input.operation });

  const limits: string[] = [];
  const near = (value: number, bound: number, span: number) => Math.abs(value - bound) < 0.01 * span;
  const c = found.candidate;
  if (near(c.majorRadius, maxRadius, maxRadius)) limits.push(`Taille : grand rayon au maximum autorisé (${maxRadius} m).`);
  if (near(c.aspectRatio, BOUNDS.aspectRatio[0], 1.9)) limits.push("Rapport d'aspect au minimum exploré (2,6).");
  if (near(c.aspectRatio, BOUNDS.aspectRatio[1], 1.9)) limits.push("Rapport d'aspect au maximum exploré (4,5).");
  if (near(c.blanket, BOUNDS.blanket[1], 1.05)) limits.push('Couverture à son épaisseur maximale explorée (1,2 m).');
  if (near(c.shield, BOUNDS.shield[0], 0.7)) limits.push('Blindage à son épaisseur minimale explorée (0,1 m).');
  for (const constraint of optimum.constraints) {
    if (constraint.id !== 'elongation' && constraint.value > 0.97 * constraint.limit) {
      limits.push(`${constraint.label} à sa limite (${constraint.limit} ${constraint.unit}).`);
    }
  }
  limits.push("Élongation fixée à 97 % de la limite de stabilité verticale ; champ au maximum du conducteur.");

  return { objective: input.objective, baseline, baselineError, optimum, limits, evaluations };
}
