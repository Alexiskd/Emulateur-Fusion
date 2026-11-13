import type { PowerParams } from '../power/power.types';

export type CoolantId = 'water' | 'helium' | 'molten-salt';

/** Réglage de la chaîne de transfert d'énergie. Températures en °C. */
export interface TransferDesign {
  coolant: CoolantId;
  /** Température du caloporteur à l'entrée de la couverture */
  inletTemperature: number;
  /** Température du caloporteur à la sortie de la couverture */
  outletTemperature: number;
  /** Température de condensation du cycle (source froide) */
  condenserTemperature: number;
  /** Température de l'air ambiant, imposée par le site */
  ambientTemperature: number;
}

export interface Coolant {
  id: CoolantId;
  label: string;
  /** Maturité technologique, pour relativiser le résultat de l'optimisation */
  maturity: string;
  /** Capacité thermique massique (kJ/kg/K) */
  heatCapacity: number;
  minInlet: number;
  maxInlet: number;
  maxOutlet: number;
  /** Écart minimal entrée-sortie (K) */
  minDeltaT: number;
  /** Raison physique de chaque limite, affichée quand elle est atteinte */
  inletLimitReason: string;
  outletLimitReason: string;
  /** Puissance de pompage rapportée à la chaleur transportée, à l'écart de référence */
  pumpingFractionRef: number;
  deltaTRef: number;
  /** Pincement de l'échangeur vers le cycle (K) */
  pinch: number;
}

export type FlowKind = 'fusion' | 'heat' | 'low-heat' | 'electric' | 'loss';

export interface Flow {
  from: string;
  to: string;
  /** Puissance (MW) */
  value: number;
  kind: FlowKind;
}

export interface TransferResult {
  design: TransferDesign;
  coolant: Coolant;
  heat: {
    blanket: number;
    divertor: number;
    /** Chaleur livrée au générateur de vapeur, chaleur des pompes comprise */
    primary: number;
    rejected: number;
  };
  primary: {
    /** Débit du caloporteur (kg/s) */
    massFlow: number;
    deltaT: number;
    pumpPower: number;
    /** Température moyenne logarithmique du caloporteur (°C) */
    meanTemperature: number;
  };
  cycle: {
    efficiency: number;
    carnotEfficiency: number;
    divertorEfficiency: number;
  };
  electric: {
    gross: number;
    net: number;
    recirculating: {
      heating: number;
      cryo: number;
      magnets: number;
      primaryPumps: number;
      cooling: number;
      other: number;
      total: number;
    };
  };
  /** Électricité nette rapportée à la puissance de fusion */
  plantEfficiency: number;
  /** Valeurs équivalentes à reporter dans le bilan simplifié */
  equivalent: { thermalEfficiency: number; pumpingFraction: number };
  flows: Flow[];
}

export interface TransferInput {
  power: PowerParams;
  design: TransferDesign;
}

export interface OptimizationResult {
  baseline: TransferResult;
  /** Meilleur réglage pour chaque caloporteur, du meilleur au moins bon */
  candidates: { result: TransferResult; gain: number; activeLimits: string[] }[];
}
