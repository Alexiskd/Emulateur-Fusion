// Miroir des types de l'API (apps/api/src/reactor/reactor.types.ts).
export type Point = [number, number];

export interface ReactorParams {
  majorRadius: number;
  minorRadius: number;
  elongation: number;
  triangularity: number;
  scrapeOffLayer: number;
  firstWallThickness: number;
  blanketThickness: number;
  shieldThickness: number;
  vesselThickness: number;
  vesselCoilGap: number;
  tfCoilThickness: number;
  tfCoilCount: number;
}

export type ComponentGeometry =
  | { kind: 'revolve'; outer: Point[]; inner?: Point[] }
  | { kind: 'coilArray'; outer: Point[]; inner: Point[]; depth: number; count: number };

export type ComponentGroup = 'plasma' | 'in-vessel' | 'vessel' | 'magnets' | 'cryostat';

export interface ReactorComponent {
  id: string;
  name: string;
  group: ComponentGroup;
  role: string;
  material: string;
  density: number | null;
  color: string;
  opacity: number;
  geometry: ComponentGeometry;
  explode: { vertical: number; radial: number };
  volume: number;
  mass: number | null;
}

export interface ReactorModel {
  params: ReactorParams;
  summary: {
    aspectRatio: number;
    plasmaVolume: number;
    firstWallArea: number;
    totalMass: number;
    outerRadius: number;
    height: number;
  };
  components: ReactorComponent[];
}

export interface ReactorPreset {
  id: string;
  name: string;
  description: string;
  params: ReactorParams;
  power: PowerParams;
  scenario: ScenarioParams;
  transfer: TransferDesign;
  magnet: MagnetId;
}

export interface OpenSourceReference {
  category:
    | 'geometry'
    | 'power'
    | 'systems'
    | 'economics'
    | 'equilibrium'
    | 'plasma'
    | 'diagnostics'
    | 'materials'
    | 'catalogs';
  name: string;
  organization: string;
  url: string;
  description: string;
  relation?: string;
}

// Miroir de apps/api/src/power/power.types.ts — puissances en MW.
export interface PowerParams {
  fusionPower: number;
  auxHeatingPower: number;
  heatingEfficiency: number;
  blanketMultiplication: number;
  thermalEfficiency: number;
  cryoPower: number;
  magnetPower: number;
  pumpingFraction: number;
  otherFraction: number;
  firstWallArea?: number;
}

export interface PowerBalance {
  neutronPower: number;
  alphaPower: number;
  blanketPower: number;
  thermalPower: number;
  grossElectric: number;
  rejectedHeat: number;
  recirculating: { heating: number; cryo: number; magnets: number; pumping: number; other: number; total: number };
  netElectric: number;
  plasmaGain: number;
  engineeringGain: number;
  recirculatingFraction: number;
  plantEfficiency: number;
  neutronWallLoad: number | null;
}

// Miroir de apps/api/src/simulation/simulation.types.ts — durées en secondes.
export interface ScenarioParams {
  premagDuration: number;
  rampUpDuration: number;
  heatingDuration: number;
  flatTopDuration: number;
  rampDownDuration: number;
  dwellDuration: number;
  mode?: Operation;
}

export interface SimulationPhase {
  id: string;
  label: string;
  description: string;
  start: number;
  end: number;
  startIndex: number;
  endIndex: number;
}

export interface SimulationResult {
  phases: SimulationPhase[];
  samples: {
    time: number[];
    plasmaCurrent: number[];
    solenoidCurrent: number[];
    temperature: number[];
    auxPower: number[];
    fusionPower: number[];
    thermalPower: number[];
    grossElectric: number[];
    netElectric: number[];
    tritiumBurned: number[];
  };
  summary: {
    cycleDuration: number;
    flatTopFusionPower: number;
    peakTemperature: number;
    confinementTime: number;
    netEnergy: number;
    averageNetPower: number;
    dutyFactor: number;
    tritiumPerPulse: number;
  };
}

/** État instantané de la machine pendant la simulation, pour animer la vue 3D (valeurs de 0 à 1). */
export interface LiveState {
  plasmaCurrent: number;
  /** Courant du solénoïde, de −1 à 1 */
  solenoidCurrent: number;
  temperature: number;
  fusion: number;
}

// Miroir de apps/api/src/transfer/transfer.types.ts — températures en °C, puissances en MW.
export type CoolantId = 'water' | 'helium' | 'molten-salt';

export interface TransferDesign {
  coolant: CoolantId;
  inletTemperature: number;
  outletTemperature: number;
  condenserTemperature: number;
  ambientTemperature: number;
}

export interface Coolant {
  id: CoolantId;
  label: string;
  maturity: string;
  heatCapacity: number;
  minInlet: number;
  maxInlet: number;
  maxOutlet: number;
  minDeltaT: number;
  inletLimitReason: string;
  outletLimitReason: string;
  pumpingFractionRef: number;
  deltaTRef: number;
  pinch: number;
}

export type FlowKind = 'fusion' | 'heat' | 'low-heat' | 'electric' | 'loss';

export interface Flow {
  from: string;
  to: string;
  value: number;
  kind: FlowKind;
}

export interface TransferResult {
  design: TransferDesign;
  coolant: Coolant;
  heat: { blanket: number; divertor: number; primary: number; rejected: number };
  primary: { massFlow: number; deltaT: number; pumpPower: number; meanTemperature: number };
  cycle: { efficiency: number; carnotEfficiency: number; divertorEfficiency: number };
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
  plantEfficiency: number;
  equivalent: { thermalEfficiency: number; pumpingFraction: number };
  flows: Flow[];
}

export interface OptimizationResult {
  baseline: TransferResult;
  candidates: { result: TransferResult; gain: number; activeLimits: string[] }[];
}

// Miroir de apps/api/src/plant/plant.types.ts — optimisation de la centrale complète.
export type MagnetId = 'lts' | 'hts';
export type Objective = 'efficiency' | 'net' | 'specific' | 'lcoe';

/** Estimation économique, montants en millions d'euros. */
export interface CostEstimate {
  capital: number;
  breakdown: { label: string; value: number }[];
  annual: number;
  replacement: number;
  blanketLifetime: number;
  capacityFactor: number;
  annualEnergy: number;
  lcoe: number | null;
}
/** pulsed : courant induit par le solénoïde · steady : courant entretenu en continu */
export type Operation = 'pulsed' | 'steady';

export interface MagnetTechnology {
  id: MagnetId;
  label: string;
  peakField: number;
  currentDensity: number;
}

export interface PlantConstraint {
  id: string;
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
    fieldOnAxis: number;
    fieldAtCoil: number;
    current: number;
    density: number;
    temperature: number;
    beta: number;
    fusionPower: number;
    alphaPower: number;
    lossPower: number;
    auxPower: number;
    bootstrapFraction: number;
    currentDrivePower: number;
    gain: number;
    confinementTime: number;
  };
  constraints: PlantConstraint[];
  feasible: boolean;
  power: PowerParams;
  transfer: TransferResult;
  mass: number;
  netElectric: number;
  plantEfficiency: number;
  netPerTonne: number;
  cost: CostEstimate;
}

export interface PlantOptimization {
  objective: Objective;
  baseline: PlantEvaluation | null;
  baselineError: string | null;
  optimum: PlantEvaluation | null;
  limits: string[];
  evaluations: number;
}
