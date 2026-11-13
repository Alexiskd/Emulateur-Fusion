import type { PowerParams } from '../power/power.types';

/** Durées des phases d'une impulsion, en secondes. */
export interface ScenarioParams {
  premagDuration: number;
  rampUpDuration: number;
  heatingDuration: number;
  flatTopDuration: number;
  rampDownDuration: number;
  dwellDuration: number;
}

export interface SimulationInput {
  power: PowerParams;
  /** Volume du plasma (m³), fourni par le modèle 3D */
  plasmaVolume: number;
  scenario: ScenarioParams;
}

export interface SimulationPhase {
  id: 'premag' | 'ramp-up' | 'heating' | 'flat-top' | 'ramp-down' | 'dwell';
  label: string;
  description: string;
  /** Bornes en secondes et en indices d'échantillons */
  start: number;
  end: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Séries temporelles, une valeur par échantillon. Chaque phase reçoit le même nombre
 * d'échantillons : l'axe des échantillons n'est donc pas linéaire en temps.
 */
export interface SimulationSamples {
  time: number[];
  /** Courant plasma, fraction du nominal (0 à 1) */
  plasmaCurrent: number[];
  /** Courant du solénoïde central, fraction du maximum (−1 à 1) */
  solenoidCurrent: number[];
  /** Température du plasma (keV) */
  temperature: number[];
  auxPower: number[];
  fusionPower: number[];
  thermalPower: number[];
  grossElectric: number[];
  netElectric: number[];
  /** Tritium consommé depuis le début de l'impulsion (g) */
  tritiumBurned: number[];
}

export interface SimulationResult {
  phases: SimulationPhase[];
  samples: SimulationSamples;
  summary: {
    cycleDuration: number;
    flatTopFusionPower: number;
    peakTemperature: number;
    /** Temps de confinement de l'énergie au point nominal (s) */
    confinementTime: number;
    /** Énergie électrique nette sur le cycle (MWh) */
    netEnergy: number;
    /** Puissance électrique nette moyennée sur le cycle (MW) */
    averageNetPower: number;
    /** Part du cycle passée en combustion */
    dutyFactor: number;
    /** Tritium consommé par impulsion (g) */
    tritiumPerPulse: number;
  };
}
