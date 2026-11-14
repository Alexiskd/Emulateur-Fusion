import type { PowerParams } from '../power/power.types';
import type { ReactorParams } from '../reactor/reactor.types';
import type { TransferDesign, TransferResult } from '../transfer/transfer.types';

export type MagnetId = 'lts' | 'hts';

export interface MagnetTechnology {
  id: MagnetId;
  label: string;
  /** Champ maximal admissible sur le conducteur (T) */
  peakField: number;
  /** Densité de courant moyenne du bobinage, structure comprise (MA/m²) */
  currentDensity: number;
}

/**
 * Mode de fonctionnement.
 * - pulsed : courant plasma induit par le solénoïde, donc impulsions de durée limitée.
 * - steady : courant entretenu en continu par le plasma lui-même (bootstrap) et par des ondes ou des neutres.
 */
export type Operation = 'pulsed' | 'steady';

/** Ce que l'optimiseur cherche à maximiser. */
export type Objective = 'efficiency' | 'net' | 'specific' | 'lcoe';

/** Estimation économique. Montants en millions d'euros. */
export interface CostEstimate {
  /** Investissement total */
  capital: number;
  /** Répartition de l'investissement, du plus gros poste au plus petit */
  breakdown: { label: string; value: number }[];
  /** Charges annuelles : capital, exploitation, remplacements */
  annual: number;
  /** Part des charges annuelles due au remplacement de la couverture et du divertor */
  replacement: number;
  /** Durée de vie de la couverture (années) */
  blanketLifetime: number;
  /** Part de l'année passée à produire */
  capacityFactor: number;
  /** Production annuelle (GWh) */
  annualEnergy: number;
  /** Coût actualisé de l'électricité (€/MWh) ; null si le bilan est négatif */
  lcoe: number | null;
}

export interface PlantInput {
  params: ReactorParams;
  /** Seuls le rendement du chauffage et la part des autres auxiliaires sont repris ; le reste est calculé. */
  power: PowerParams;
  design: TransferDesign;
  magnet: MagnetId;
  /** Pulsé par défaut */
  operation?: Operation;
}

export interface PlantOptimizationInput extends PlantInput {
  objective: Objective;
  /** Grand rayon maximal autorisé (m) : borne la taille de la machine. */
  maxMajorRadius: number;
}

export interface Constraint {
  id: 'radial-build' | 'wall-load' | 'divertor' | 'elongation';
  label: string;
  value: number;
  limit: number;
  unit: string;
  ok: boolean;
}

export interface PlantEvaluation {
  params: ReactorParams;
  magnet: MagnetTechnology;
  operation: Operation;
  plasma: {
    /** Champ toroïdal sur l'axe (T) */
    fieldOnAxis: number;
    /** Champ sur le conducteur de la jambe intérieure (T) */
    fieldAtCoil: number;
    /** Courant plasma (MA) */
    current: number;
    /** Densité moyenne (10²⁰ m⁻³) */
    density: number;
    /** Température moyenne (keV) */
    temperature: number;
    /** Bêta toroïdal (%) */
    beta: number;
    fusionPower: number;
    alphaPower: number;
    /** Pertes par transport à compenser (MW) */
    lossPower: number;
    auxPower: number;
    /** Part du courant plasma générée par le plasma lui-même */
    bootstrapFraction: number;
    /** Puissance à injecter pour entretenir le reste du courant en continu (MW) ; 0 en mode pulsé */
    currentDrivePower: number;
    gain: number;
    confinementTime: number;
  };
  constraints: Constraint[];
  feasible: boolean;
  /** Hypothèses de puissance déduites, prêtes à reporter dans le bilan */
  power: PowerParams;
  transfer: TransferResult;
  /** Masse totale de la machine (t) */
  mass: number;
  netElectric: number;
  /** Rendement de la chaîne complète : électricité nette / puissance de fusion */
  plantEfficiency: number;
  /** Électricité nette par tonne de machine (kW/t) */
  netPerTonne: number;
  cost: CostEstimate;
}

export interface PlantOptimization {
  objective: Objective;
  baseline: PlantEvaluation | null;
  /** Raison pour laquelle le réacteur de départ n'a pas pu être évalué */
  baselineError: string | null;
  optimum: PlantEvaluation | null;
  /** Ce qui borne l'optimum : contraintes atteintes et limites de recherche */
  limits: string[];
  evaluations: number;
}
