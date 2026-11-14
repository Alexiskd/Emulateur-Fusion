import type { ReactorModel } from '../reactor/reactor.types';
import type { CostEstimate, MagnetId, Operation } from './plant.types';

/**
 * Estimation du coût de l'électricité (LCOE), dans l'esprit des outils technico-économiques
 * (Tokamak-TEA-Tool, module de coûts de PROCESS) : investissement par poste, charges annuelles,
 * production annuelle. Les coûts unitaires sont des ordres de grandeur, en millions d'euros.
 */

/** Coût de fabrication par tonne (M€/t), selon l'identifiant du composant. */
const UNIT_COSTS: { prefix: string; label: string; cost: number | Record<MagnetId, number> }[] = [
  { prefix: 'tf-coils', label: 'Aimants', cost: { lts: 0.12, hts: 0.25 } },
  { prefix: 'central-solenoid', label: 'Aimants', cost: { lts: 0.12, hts: 0.25 } },
  { prefix: 'pf-coil', label: 'Aimants', cost: { lts: 0.08, hts: 0.08 } },
  { prefix: 'first-wall', label: 'Couverture et première paroi', cost: 0.2 },
  { prefix: 'blanket', label: 'Couverture et première paroi', cost: 0.15 },
  { prefix: 'divertor', label: 'Divertor', cost: 0.3 },
  { prefix: 'shield', label: 'Blindage et enceinte à vide', cost: 0.03 },
  { prefix: 'vacuum-vessel', label: 'Blindage et enceinte à vide', cost: 0.06 },
  { prefix: 'cryostat', label: 'Cryostat', cost: 0.02 },
];

const HEATING_COST = 6; // M€ par MW injecté
const CRYOPLANT_COST = 4; // M€ par MW électrique de cryogénie
const TURBINE_ISLAND_COST = 0.8; // M€ par MW électrique brut
const TRITIUM_PLANT_COST = 300; // M€, cycle du combustible et installations chaudes
const BUILDINGS_FRACTION = 0.3; // bâtiments et site, en part des équipements
const INDIRECT_FACTOR = 1.5; // ingénierie, aléas, intérêts pendant la construction
const FIXED_CHARGE_RATE = 0.08; // annuité du capital
const OPERATION_FRACTION = 0.03; // exploitation et maintenance, par an
const BLANKET_FLUENCE_LIMIT = 5; // MW·an/m² avant remplacement de la couverture
const DIVERTOR_LIFETIME = 2; // années de pleine puissance
const AVAILABILITY = 0.75;
/** En pulsé, une part du temps est perdue entre les impulsions. */
const PULSED_DUTY = 0.85;

export interface CostInput {
  model: ReactorModel;
  magnet: MagnetId;
  operation: Operation;
  auxPower: number;
  cryoPower: number;
  grossElectric: number;
  netElectric: number;
  /** Charge neutronique sur la paroi (MW/m²) */
  wallLoad: number;
}

export function estimateCost(input: CostInput): CostEstimate {
  const groups = new Map<string, number>();
  const add = (label: string, value: number) => groups.set(label, (groups.get(label) ?? 0) + value);

  for (const component of input.model.components) {
    const unit = UNIT_COSTS.find((u) => component.id.startsWith(u.prefix));
    if (!unit || component.mass === null) continue;
    const cost = typeof unit.cost === 'number' ? unit.cost : unit.cost[input.magnet];
    add(unit.label, component.mass * cost);
  }
  add('Chauffage et entraînement du courant', input.auxPower * HEATING_COST);
  add('Cryogénie', input.cryoPower * CRYOPLANT_COST);
  add('Turbine, alternateur et refroidissement', Math.max(0, input.grossElectric) * TURBINE_ISLAND_COST);
  add('Cycle du combustible', TRITIUM_PLANT_COST);

  const equipment = [...groups.values()].reduce((a, b) => a + b, 0);
  add('Bâtiments et site', equipment * BUILDINGS_FRACTION);
  const direct = equipment * (1 + BUILDINGS_FRACTION);
  add('Ingénierie, aléas et intérêts', direct * (INDIRECT_FACTOR - 1));
  const capital = direct * INDIRECT_FACTOR;

  // Les composants face au plasma s'usent sous le flux de neutrons et sont remplacés régulièrement.
  const capacityFactor = AVAILABILITY * (input.operation === 'pulsed' ? PULSED_DUTY : 1);
  const blanketLifetime = BLANKET_FLUENCE_LIMIT / Math.max(1e-6, input.wallLoad * capacityFactor);
  const replacement =
    (groups.get('Couverture et première paroi') ?? 0) / Math.min(40, blanketLifetime) +
    (groups.get('Divertor') ?? 0) / (DIVERTOR_LIFETIME / capacityFactor);

  const annual = capital * FIXED_CHARGE_RATE + direct * OPERATION_FRACTION + replacement;
  const annualEnergy = input.netElectric * 8.76 * capacityFactor; // GWh
  return {
    capital,
    breakdown: [...groups.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    annual,
    replacement,
    blanketLifetime,
    capacityFactor,
    annualEnergy,
    lcoe: annualEnergy > 0 ? (annual * 1000) / annualEnergy : null,
  };
}
